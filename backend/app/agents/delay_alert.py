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
from app.analytics.combos import mask_of
from app.analytics.views import clean_value

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
            "actual_outcome": {"note": "Known only after delivery; not used in the prediction or the message",
                               "delivered_date": clean_value("delivered_date", r.delivered_date),
                               "days_late": int(r.days_late)},
            "guardrail_flags": flags}
