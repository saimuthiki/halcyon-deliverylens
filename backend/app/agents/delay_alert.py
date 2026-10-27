"""Delay-alert agent: at dispatch, warn the client that a delivery is likely to be late.

We act as if it is dispatch time (shipped_ts): the delivery's causes are known, its outcome is not.
The predicted delay is the median days late of past late deliveries with the same cause combination
(the delivery itself left out). Facts come from the data; the model only writes the wording. The
message never claims an action the system does not take, and it is a draft for Customer Success to
approve. 12 of 34 complaints are "Not told about the delay".
"""
import json
import math
import re
from datetime import timedelta

import numpy as np

from app.agents.llm_client import LLMClient, extract_json
from app.analytics.causes import CAUSES, PICK_LIST_CUTOFF_MINUTES, causes_of
from app.analytics import views
from app.analytics.combos import mask_of
from app.analytics.late_orders import expected_penalty_per_late
from app.analytics.views import clean_value
from app.config import get_settings

AGENT = "delay_alert"
MIN_SAMPLE = 5  # fewer late deliveries than this in the same combination -> use all late deliveries with a cause
DRAFT_NOTE = "DRAFT: for Customer Success to review and approve before sending."
# Things the system does not do; a message must not say we did them.
ACTION_CLAIM_RE = re.compile(
    r"\bwe(?:'ve| have| are| will)\s+(?:now\s+|already\s+)?(?:rerout|expedit|re-?rout|upgrad|switch|mov|chang|"
    r"rebalanc|confirm|escalat|prioriti[sz]|refund|credit|compensat|waiv|raised|arrang)", re.I)


class NotDelayed(Exception):
    pass


def _reason(cause: str, r) -> str:
    """Client-facing reason, worded as known at dispatch."""
    if cause == "incomplete_address":
        return ("some delivery address details were missing when the order arrived, so it was held until they "
                "were confirmed")
    if cause == "same_day_after_cutoff":
        return (f"the same-day order arrived at {r.order_received_ts:%H:%M}, after our "
                f"{PICK_LIST_CUTOFF_MINUTES // 60:02d}:00 pick-list cutoff, so it was picked on "
                f"{r.pick_list_date:%Y-%m-%d}")
    if cause == "stock_not_at_nearest":
        return (f"the item was not in stock at the warehouse nearest you, so it is shipping from a warehouse "
                f"{int(r.distance_miles)} miles away")
    if cause == "weak_carrier_lane":
        return (f"the carrier on this lane (carrier {r.carrier_id} to the {r.destination_region}) often runs "
                "behind schedule")
    if cause == "route_deviation":
        return "the delivery vehicle is running more than 20% beyond its planned route"
    raise ValueError(cause)


def predict_delay(ds, delivery_id: str) -> dict:
    """Median days late of other late deliveries with the same cause combination."""
    df = ds.deliveries
    keys = ds.combos.keys
    r = ds.by_id.loc[delivery_id]
    causes = causes_of(r)
    others = df.delivery_id.to_numpy() != delivery_id
    same = others & (keys == mask_of(causes))
    late = df.late.to_numpy()
    sample = same & late
    fallback = int(sample.sum()) < MIN_SAMPLE
    if fallback:
        sample = others & late & (keys != 0)
    days = int(math.ceil(float(np.median(df.days_late.to_numpy()[sample]))))
    method = ("median days late of past late deliveries with the same cause combination, rounded up"
              if not fallback else "median days late of all past late deliveries with any cause, rounded up")
    return {
        "predicted_delay_days": days,
        "predicted_date": (r.promised_date + timedelta(days=days)).date().isoformat(),
        "basis": {
            "as_of": clean_value("shipped_ts", r.shipped_ts),
            "cause_combination": causes,
            "method": method,
            "late_deliveries_in_sample": int(sample.sum()),
            "on_time_rate_for_combination": round(1 - float(late[same].mean()), 4) if same.any() else None,
            "fallback": fallback,
        },
    }


def delay_facts(ds, delivery_id: str) -> dict:
    if delivery_id not in ds.by_id.index:
        raise KeyError(delivery_id)
    r = ds.by_id.loc[delivery_id]
    causes = causes_of(r)
    if not r.late and not causes:
        raise NotDelayed(delivery_id)
    client_name = ds.clients.set_index("client_id").client_name.get(r.client_id, r.client_id)
    prediction = predict_delay(ds, delivery_id)
    return {
        "delivery_id": r.delivery_id, "order_id": r.order_id, "client_id": r.client_id,
        "client_name": client_name, "commitment_type": r.commitment_type,
        "order_received": clean_value("order_received_ts", r.order_received_ts),
        "shipped_at": clean_value("shipped_ts", r.shipped_ts),
        "promised_date": clean_value("promised_date", r.promised_date),
        "predicted_date": prediction["predicted_date"],
        "predicted_delay_days": prediction["predicted_delay_days"],
        "carrier_id": r.carrier_id, "destination_region": r.destination_region,
        "causes": [{"cause": c, "label": CAUSES[c], "reason": _reason(c, r)} for c in causes],
        "basis": prediction["basis"],
    }


# ---------------------------------------------------------------- recovery plan for Customer Success
# Deterministic: the AI only words the client draft. These are internal next steps, never sent to the client.
CLIENT_POINTS = {"at_risk": 40, "sla": 30, "tier_1": 20, "tier_2": 10}  # who the client is
COMPLAINT_POINTS = 15        # the client complained in the 90 days before dispatch
SEVERE_DELAY_POINTS = 15     # predicted delay of SEVERE_DELAY_DAYS or more
SEVERE_DELAY_DAYS = 3
COMPLAINT_WINDOW_DAYS = 90
HIGH_PRIORITY, MEDIUM_PRIORITY = 60, 30


def _cause_action(ds, cause: str, r) -> dict:
    region = r.destination_region
    if cause == "incomplete_address":
        return {"action": "Call the client today to confirm the full delivery address before the carrier's "
                          "first attempt.", "owner": "Customer Success"}
    if cause == "weak_carrier_lane":
        best = views.carrier_scorecard(ds)["recommended_by_region"][region]
        return {"action": f"Ask carrier {r.carrier_id} for a tracking update today, and book future {region} "
                          f"orders with carrier {best['carrier_id']} ({best['on_time_rate']:.0%} on time there).",
                "owner": "Carrier manager", "recommended_carrier": best["carrier_id"]}
    if cause == "stock_not_at_nearest":
        return {"action": f"Flag this client's stock for rebalancing to {r.nearest_warehouse_id}, the nearest "
                          f"warehouse to {region}; it shipped from {r.fulfilment_warehouse_id} instead.",
                "owner": "Inventory planning"}
    if cause == "same_day_after_cutoff":
        s = get_settings()
        return {"action": "Remind the client that same-day orders need to reach us by 08:00 (or "
                          f"{s.same_day_grace_until} at the latest); until {s.same_day_hard_stop} only urgent "
                          "orders are added, and after that offer next-day at order time.",
                "owner": "Warehouse"}
    return {"action": f"Raise the route deviation with carrier {r.carrier_id} and check the driver's route.",
            "owner": "Carrier manager"}


def recovery_plan(ds, delivery_id: str, causes: list[str], predicted_days: int) -> dict:
    """Who should do what, and how urgently, before the client has to chase."""
    r = ds.by_id.loc[delivery_id]
    c = ds.clients.set_index("client_id").loc[r.client_id]
    at_risk = r.client_id in ds.at_risk_client_ids
    sla = c.sla_penalty_clause == "Y"
    parts = [{"rule": rule, "points": pts} for rule, pts, on in (
        ("At-risk client", CLIENT_POINTS["at_risk"], at_risk), ("SLA penalty clause", CLIENT_POINTS["sla"], sla),
        ("Tier 1 client", CLIENT_POINTS["tier_1"], c.account_tier == "Tier 1"),
        ("Tier 2 client", CLIENT_POINTS["tier_2"], c.account_tier == "Tier 2")) if on]
    cp = ds.complaints
    since = r.shipped_ts - timedelta(days=COMPLAINT_WINDOW_DAYS)
    recent = cp[(cp.client_id == r.client_id) & (cp.complaint_date >= since) & (cp.complaint_date <= r.shipped_ts)]
    if len(recent):
        parts.append({"rule": f"{len(recent)} complaint{'s' if len(recent) != 1 else ''} in the last "
                              f"{COMPLAINT_WINDOW_DAYS} days", "points": COMPLAINT_POINTS})
    if predicted_days >= SEVERE_DELAY_DAYS:
        parts.append({"rule": f"Predicted {predicted_days} days late", "points": SEVERE_DELAY_POINTS})
    score = sum(p["points"] for p in parts)
    priority = "high" if score >= HIGH_PRIORITY else "medium" if score >= MEDIUM_PRIORITY else "normal"
    escalate = at_risk or priority == "high"
    exposure = None
    if sla:
        exposure = int(round(expected_penalty_per_late(ds, r.client_id)))
    actions = [{"cause": cause, **_cause_action(ds, cause, r)} for cause in causes]
    if escalate:
        why = "at risk of leaving" if at_risk else f"high priority ({score} points)"
        actions.append({"cause": None, "owner": "Account owner",
                        "action": f"Call {c.client_name} before they chase: the client is {why}."})
    return {"priority": priority, "priority_score": score, "priority_parts": parts,
            "escalate_to_account_owner": bool(escalate), "penalty_exposure_usd": exposure,
            "penalty_note": ("Estimate: the expected SLA penalty per late delivery for this client (its "
                             "penalties / its late deliveries)." if exposure is not None
                             else "No SLA penalty clause in this client's contract."),
            "actions": actions,
            "method": ("Rules, not AI. Points: at-risk client {at_risk}, SLA clause {sla}, Tier 1 {tier_1}, Tier 2 {tier_2}, "
                       .format(**CLIENT_POINTS) + f"plus {COMPLAINT_POINTS} for a complaint "
                       f"in the last {COMPLAINT_WINDOW_DAYS} days and {SEVERE_DELAY_POINTS} for a predicted delay "
                       f"of {SEVERE_DELAY_DAYS}+ days. High at {HIGH_PRIORITY}+, medium at {MEDIUM_PRIORITY}+. "
                       "At-risk clients always go to the account owner.")}


def _template(f: dict) -> tuple[str, str]:
    commitment = f["commitment_type"].replace("_", "-")
    days = f["predicted_delay_days"]
    why = "; ".join(c["reason"] for c in f["causes"]) or "deliveries like this one have recently run late"
    rate = f["basis"]["on_time_rate_for_combination"]
    odds = f" Similar deliveries arrived on time only about {rate:.0%} of the time." if rate is not None else ""
    subject = (f"Delivery {f['delivery_id']} may arrive after {f['promised_date']}: estimated "
               f"{f['predicted_date']}")
    body = (f"Dear {f['client_name']} team,\n\n"
            f"Your {commitment} delivery {f['delivery_id']} (order {f['order_id']}) left our warehouse on "
            f"{f['shipped_at'][:10]}. It is at risk of missing the promised date of {f['promised_date']}.{odds} "
            f"If it is late, our current estimate is {f['predicted_date']}, about {days} day{'s' if days != 1 else ''} "
            f"late.\n\nWhy: {why}.\n\n"
            f"This estimate is the typical delay of {f['basis']['late_deliveries_in_sample']:,} similar past late "
            "deliveries, so the actual date may differ. If the new date causes a problem, reply to this email and "
            "your account manager will get back to you.\n\nKind regards,\nHalcyon Logistics Customer Success")
    return subject, body


def _mock_message(f: dict) -> str:
    subject, body = _template(f)
    return json.dumps({"subject": subject, "message": body})


SYSTEM = ("You write short, honest, proactive delay notices from Halcyon Logistics to a business client, at the "
          "moment the delivery is dispatched. Use ONLY the facts provided; do not invent dates, causes, compensation "
          "or promises. Never say we have taken an action (rerouted, expedited, switched carrier, etc.): no such "
          "action has been taken. Say the predicted date is an estimate. Mention the promised date and the predicted "
          "date. Plain English, under 150 words. Reply with ONLY JSON: {\"subject\": string, \"message\": string}.")


def run_delay_alert(ds, delivery_id: str, llm: LLMClient | None = None) -> dict:
    facts = delay_facts(ds, delivery_id)
    llm = llm or LLMClient()
    resp = llm.generate(agent=AGENT, system=SYSTEM, prompt=f"Facts:\n{json.dumps(facts, indent=2)}",
                        mock=lambda: _mock_message(facts), tier="fast", json_output=True)
    flags = list(resp.flags)
    try:
        out = extract_json(resp.text)
        subject, message = str(out["subject"]), str(out["message"])
    except (ValueError, KeyError, TypeError):
        subject, message = f"Update on delivery {delivery_id}", resp.text.strip()
        flags.append("llm_output_not_json")
    # Output guardrails: no invented actions, the key dates present, and a clear draft note at the end.
    if ACTION_CLAIM_RE.search(message) or ACTION_CLAIM_RE.search(subject):
        subject, message = _template(facts)
        flags.append("action_claim_replaced")
    for key in ("promised_date", "predicted_date"):
        if facts[key] not in message:
            message += f"\n\n({key.replace('_', ' ').capitalize()}: {facts[key]})"
            flags.append(f"fact_appended_{key}")
    message = message.replace(DRAFT_NOTE, "").rstrip() + "\n\n" + DRAFT_NOTE
    r = ds.by_id.loc[delivery_id]
    return {"agent_run_id": resp.run_id, "provider": resp.provider, "model": resp.model,
            "delivery_id": delivery_id, "status": "draft", "requires_approval": True,
            "predicted_delay_days": facts["predicted_delay_days"], "predicted_date": facts["predicted_date"],
            "basis": facts["basis"], "facts": facts, "subject": subject, "message": message,
            "recovery": recovery_plan(ds, delivery_id, [c["cause"] for c in facts["causes"]],
                                      facts["predicted_delay_days"]),
            "actual_outcome": {"note": "Known only after delivery; not used in the prediction or the message",
                               "delivered_date": clean_value("delivered_date", r.delivered_date),
                               "days_late": int(r.days_late)},
            "guardrail_flags": flags}
