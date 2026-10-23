"""Delay-alert agent: draft a proactive message to the client before they have to complain.

Facts (dates, causes, carrier) come from the data and are injected into the prompt; the model only
writes the wording. 12 of 34 complaints are "Not told about the delay".
"""
import json

from app.agents.llm_client import LLMClient, extract_json
from app.analytics.causes import CAUSES, causes_of
from app.analytics.views import _cause_sentence, clean_value

AGENT = "delay_alert"

ACTIONS = {
    "incomplete_address": "we have confirmed the full delivery address with your team",
    "same_day_after_cutoff": "we have put your order on the first available pick list",
    "stock_not_at_nearest": "we are rebalancing stock so future orders ship from the warehouse nearest you",
    "weak_carrier_lane": "we are moving your region to the best-performing carrier for that lane",
    "route_deviation": "we have raised the route deviation with the carrier",
}


class NotDelayed(Exception):
    pass


def delay_facts(ds, delivery_id: str) -> dict:
    if delivery_id not in ds.by_id.index:
        raise KeyError(delivery_id)
    r = ds.by_id.loc[delivery_id]
    causes = causes_of(r)
    if not r.late and not causes:
        raise NotDelayed(delivery_id)
    client_name = ds.clients.set_index("client_id").client_name.get(r.client_id, r.client_id)
    return {
        "delivery_id": r.delivery_id, "order_id": r.order_id, "client_id": r.client_id,
        "client_name": client_name, "commitment_type": r.commitment_type,
        "order_received": clean_value("order_received_ts", r.order_received_ts),
        "promised_date": clean_value("promised_date", r.promised_date),
        "expected_delivery_date": clean_value("delivered_date", r.delivered_date),
        "days_late": max(int(r.days_late), 0), "is_late": bool(r.late),
        "carrier_id": r.carrier_id, "destination_region": r.destination_region,
        "causes": [{"cause": c, "label": CAUSES[c], "detail": _cause_sentence(c, r)} for c in causes],
        "actions": [ACTIONS[c] for c in causes],
    }


def _mock_message(f: dict) -> str:
    commitment = f["commitment_type"].replace("_", "-")
    if f["is_late"]:
        when = (f"is now expected on {f['expected_delivery_date']}, {f['days_late']} "
                f"day{'s' if f['days_late'] != 1 else ''} after the promised date of {f['promised_date']}")
        subject = f"Update on delivery {f['delivery_id']}: now expected {f['expected_delivery_date']}"
    else:
        when = f"is at risk of missing the promised date of {f['promised_date']}"
        subject = f"Heads-up on delivery {f['delivery_id']}"
    why = "; ".join(c["detail"] for c in f["causes"]) or "a delay in our network"
    actions = "; ".join(f["actions"]) or "we are tracking the shipment closely"
    body = (f"Dear {f['client_name']} team,\n\n"
            f"We want to tell you before you have to ask: your {commitment} delivery {f['delivery_id']} "
            f"(order {f['order_id']}) {when}.\n\n"
            f"Why: {why}.\n\nWhat we are doing: {actions}.\n\n"
            "We are sorry for the inconvenience. Reply to this email and your account manager will "
            "follow up the same day.\n\nKind regards,\nHalcyon Logistics Customer Success")
    return json.dumps({"subject": subject, "message": body})


SYSTEM = ("You write short, honest, proactive delay notices from Halcyon Logistics to a business client. "
          "Use ONLY the facts provided; do not invent dates, causes, compensation or promises. Mention the "
          "promised date and the expected delivery date. Plain English, under 150 words. Reply with ONLY "
          "JSON: {\"subject\": string, \"message\": string}.")


def run_delay_alert(ds, delivery_id: str, llm: LLMClient | None = None) -> dict:
    facts = delay_facts(ds, delivery_id)
    llm = llm or LLMClient()
    resp = llm.generate(agent=AGENT, system=SYSTEM, prompt=f"Facts:\n{json.dumps(facts, indent=2)}",
                        mock=lambda: _mock_message(facts), tier="fast")
    flags = list(resp.flags)
    try:
        out = extract_json(resp.text)
        subject, message = str(out["subject"]), str(out["message"])
    except (ValueError, KeyError, TypeError):
        subject, message = f"Update on delivery {delivery_id}", resp.text.strip()
        flags.append("llm_output_not_json")
    # Output guardrail: the key facts must be in the message.
    for key in ("promised_date", "expected_delivery_date"):
        if facts[key] not in message:
            message += f"\n\n({key.replace('_', ' ').capitalize()}: {facts[key]})"
            flags.append(f"fact_appended_{key}")
    return {"agent_run_id": resp.run_id, "provider": resp.provider, "model": resp.model,
            "delivery_id": delivery_id, "facts": facts, "subject": subject, "message": message,
            "guardrail_flags": flags}
