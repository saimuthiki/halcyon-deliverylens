"""Morning Note Agent: the 08:00 huddle message for warehouse managers and Customer Success.

The board (risks, fixes, owners) comes from analytics/risk_board.py, which uses no AI. The model only turns the
top of the board into a short message; every number in it must come from the board, or the template is used.
Outcomes (what really happened) are never passed to the model.
"""
import json

from app.agents.llm_client import LLMClient, extract_json
from app.analytics.risk_board import LABELS, risk_board
from app.guardrails import unverified_numbers

AGENT = "morning_note"
AGENT_NAME = "Morning Note Agent"
NOTE_ITEMS = 5


def _facts(board: dict) -> dict:
    items = [{"delivery_id": x["delivery_id"], "client_id": x["client_id"], "at_risk_client": x["at_risk_client"],
              "risk": x["risk"], "risk_after_fixes": x["risk_after_fixes"],
              "causes": [LABELS[c] for c in x["causes"]],
              "actions": [{"action": f["action"], "owner": f["owner"]} for f in x["fixes"]]}
             for x in board["top"][:NOTE_ITEMS]]
    return {"day": board["day"], "warehouse": board["warehouse"] or "all warehouses", "shipments": board["shipments"],
            "expected_late": board["expected_late"], "expected_late_after_fixes": board["expected_late_after_fixes"],
            "fixable_shipments": board["fixable_shipments"], "top_shipments": items}


def _pct(x: float) -> str:
    return f"{x * 100:.0f}%"


def _template(f: dict) -> dict:
    lines = [f"Good morning. {f['shipments']} shipments on today's pick list ({f['warehouse']}). On past patterns about "
             f"{f['expected_late']} will arrive late; the fixes below bring that to about {f['expected_late_after_fixes']}.",
             "", "Act on these first:"]
    for n, x in enumerate(f["top_shipments"], 1):
        who = " (at-risk client)" if x["at_risk_client"] else ""
        lines.append(f"{n}. {x['delivery_id']} for {x['client_id']}{who}: {_pct(x['risk'])} risk "
                     f"({', '.join(x['causes']).lower()}).")
        lines += [f"   - {a['action']} ({a['owner']})" for a in x["actions"]]
    return {"subject": f"Morning risk board, {f['day']}", "body": "\n".join(lines)}


SYSTEM = (
    "You are the Morning Note Agent at Halcyon Logistics. Write the short 08:00 huddle message for warehouse managers "
    "and Customer Success from today's risk board. Use ONLY the facts provided: every number must come from them, "
    "keep each action and owner exactly as given, do not add causes or promises. Lead with how many shipments are "
    "likely to be late and how many the fixes save, then the shipments to act on first. Plain text, under 180 words. "
    "Reply with ONLY JSON: {\"subject\": string, \"body\": string}.")


def run_morning_note(ds, day: str | None = None, warehouse: str | None = None, llm: LLMClient | None = None) -> dict:
    facts = _facts(risk_board(ds, day, warehouse))
    llm = llm or LLMClient()
    template = _template(facts)
    resp = llm.generate(agent=AGENT, system=SYSTEM, prompt=f"Facts:\n{json.dumps(facts, indent=2)}",
                        mock=lambda: json.dumps(template), tier="fast", max_tokens=900, json_output=True)
    flags = list(resp.flags)
    try:
        out = extract_json(resp.text)
        note = {"subject": str(out["subject"]), "body": str(out["body"])}
    except (ValueError, KeyError, TypeError):
        note, flags = template, flags + ["llm_output_not_json_used_template"]
    bad = unverified_numbers(note["subject"] + "\n" + note["body"], facts, extra={"08", "14"})
    if bad:
        note = template
        flags.append("unverified_numbers_used_template")
    return {"agent_run_id": resp.run_id, "agent_name": AGENT_NAME, "provider": resp.provider, "model": resp.model,
            "day": facts["day"], "note": note, "unverified_numbers": bad, "guardrail_flags": flags}
