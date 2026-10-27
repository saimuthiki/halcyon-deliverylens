"""Carrier Claims Agent: recover SLA penalties that Halcyon paid for delays the carrier caused.

A late delivery goes into a carrier's claim pack only when the evidence points at the carrier alone:
- Halcyon paid an SLA penalty for it;
- nothing on Halcyon's side went wrong (address complete, order before the 08:00 cutoff, stock at the
  nearest warehouse) and Halcyon handed it over on its pick-list date;
- the carrier side shows a cause: a weak lane for that carrier, or the driver going more than 20% beyond
  the planned route.
Deliveries where both sides had a cause are listed as shared fault and not claimed.

The packs, totals and evidence are data; the model writes the claim letter only, every number in it must come
from the pack, and the letter is a draft for the carrier manager. Whether the carrier must pay depends on its
contract: an assumption to confirm with Halcyon.
"""
import json

import pandas as pd

from app.agents.llm_client import LLMClient, extract_json
from app.analytics.causes import ROUTE_DEVIATION_LIMIT
from app.guardrails import unverified_numbers

AGENT = "carrier_claims"
AGENT_NAME = "Carrier Claims Agent"
DRAFT_NOTE = "DRAFT: for the carrier manager to review before anything is sent."
HALCYON_CAUSES = ["incomplete_address", "same_day_after_cutoff", "stock_not_at_nearest"]
CARRIER_CAUSES = ["weak_carrier_lane", "route_deviation"]
LETTER_LINES = 5  # example deliveries quoted in the letter; the full list goes in the attachment
CONTRACT_NOTE = ("Assumption: the carrier contracts let Halcyon pass on SLA penalties caused by the carrier. "
                 "The data does not show the contract terms; confirm with Halcyon before sending.")


class UnknownCarrier(KeyError):
    pass


class NothingToClaim(ValueError):
    pass


def _tagged(ds) -> pd.DataFrame:
    df = ds.deliveries
    late = df[df.late & (df.penalty_usd > 0)].copy()
    late["halcyon_side"] = late[HALCYON_CAUSES].any(axis=1)
    late["carrier_side"] = late[CARRIER_CAUSES].any(axis=1)
    late["handed_over_on_time"] = late.shipped_ts.dt.normalize() == late.pick_list_date
    late["claimable"] = ~late.halcyon_side & late.carrier_side & late.handed_over_on_time
    late["month"] = late.delivered_date.dt.strftime("%Y-%m")
    return late


def claims_summary(ds) -> dict:
    """Per carrier: what can be claimed, what is shared fault, by month."""
    late = _tagged(ds)
    carriers = ds.carriers.set_index("carrier_id")
    rows = []
    for cid in sorted(carriers.index):
        c = late[late.carrier_id == cid]
        cl = c[c.claimable]
        shared = c[c.halcyon_side & c.carrier_side]
        rows.append({
            "carrier_id": cid, "carrier_name": carriers.loc[cid, "carrier_name"],
            "penalties_paid_usd": int(c.penalty_usd.sum()),
            "claimable_deliveries": int(len(cl)), "claimable_usd": int(cl.penalty_usd.sum()),
            "with_route_deviation": int(cl.route_deviation.sum()),
            "shared_fault_deliveries": int(len(shared)), "shared_fault_usd": int(shared.penalty_usd.sum()),
            "by_month": [{"month": m, "deliveries": int(len(g)), "claimable_usd": int(g.penalty_usd.sum())}
                         for m, g in cl.groupby("month")],
        })
    rows.sort(key=lambda r: -r["claimable_usd"])
    total = int(late[late.claimable].penalty_usd.sum())
    return {"carriers": rows, "total_claimable_usd": total,
            "total_penalties_paid_usd": int(late.penalty_usd.sum()),
            "period": [str(ds.deliveries.order_received_ts.min().date()), str(ds.deliveries.order_received_ts.max().date())],
            "rule": ("Claimable: Halcyon paid an SLA penalty, handed the order over on its pick-list date with a complete "
                     "address and stock at the nearest warehouse, and the carrier side shows a weak lane or a route "
                     f"more than {ROUTE_DEVIATION_LIMIT:.0%} beyond plan. Shared fault is not claimed."),
            "contract_note": CONTRACT_NOTE}


def _line(r) -> dict:
    dev = None
    if pd.notna(r.actual_route_km) and r.planned_route_km:
        dev = round(float(r.actual_route_km / r.planned_route_km - 1), 3)
    evidence = []
    if r.weak_carrier_lane:
        evidence.append(f"weak lane: carrier {r.carrier_id} to the {r.destination_region}")
    if r.route_deviation:
        evidence.append(f"route {dev:.0%} beyond plan" if dev is not None else "route beyond plan")
    return {"delivery_id": r.delivery_id, "order_id": r.order_id, "client_id": r.client_id,
            "region": r.destination_region, "handed_over": r.shipped_ts.strftime("%Y-%m-%d %H:%M"),
            "promised_date": r.promised_date.date().isoformat(), "delivered_date": r.delivered_date.date().isoformat(),
            "days_late": int(r.days_late), "penalty_usd": int(r.penalty_usd),
            "planned_route_km": float(r.planned_route_km), "actual_route_km": None if pd.isna(r.actual_route_km) else float(r.actual_route_km),
            "route_deviation": dev, "evidence": evidence}


def claim_pack(ds, carrier_id: str, month: str | None = None) -> dict:
    carriers = ds.carriers.set_index("carrier_id")
    if carrier_id not in carriers.index:
        raise UnknownCarrier(carrier_id)
    late = _tagged(ds)
    c = late[(late.carrier_id == carrier_id) & late.claimable]
    if month:
        c = c[c.month == month]
    if c.empty:
        raise NothingToClaim(carrier_id)
    c = c.sort_values(["penalty_usd", "days_late"], ascending=False)
    lines = [_line(r) for r in c.itertuples()]
    return {
        "carrier_id": carrier_id, "carrier_name": carriers.loc[carrier_id, "carrier_name"],
        "month": month, "period": [c.delivered_date.min().date().isoformat(), c.delivered_date.max().date().isoformat()],
        "deliveries": len(lines), "claim_usd": int(c.penalty_usd.sum()),
        "days_late_total": int(c.days_late.sum()), "with_route_deviation": int(c.route_deviation.sum()),
        "on_weak_lanes": int(c.weak_carrier_lane.sum()),
        "regions": sorted(c.destination_region.unique().tolist()),
        "examples": lines[:LETTER_LINES], "lines": lines, "contract_note": CONTRACT_NOTE,
    }


def _template(p: dict) -> dict:
    when = f"In {p['month']}" if p["month"] else f"Between {p['period'][0]} and {p['period'][1]}"
    examples = "\n".join(f"- {x['delivery_id']} (order {x['order_id']}): promised {x['promised_date']}, delivered "
                         f"{x['delivered_date']}, {x['days_late']} days late, ${x['penalty_usd']:,} penalty"
                         for x in p["examples"])
    body = (f"Dear {p['carrier_name']} account team,\n\n"
            f"{when}, {p['deliveries']:,} deliveries handled by {p['carrier_name']} arrived late. For each one, "
            "Halcyon handed the goods over on the planned day with a complete address and stock from the nearest "
            f"warehouse, and our client charged us an SLA penalty. In total Halcyon paid ${p['claim_usd']:,} in "
            f"penalties for these deliveries ({p['days_late_total']:,} days late in all; {p['with_route_deviation']:,} "
            "of them with the route driven well beyond plan).\n\n"
            f"Examples:\n{examples}\n\n"
            f"The full list of {p['deliveries']:,} deliveries is attached. We ask you to credit "
            f"${p['claim_usd']:,}, or to contact us within 14 days to review the list together.\n\n"
            "Kind regards,\nCarrier management, Halcyon Logistics")
    return {"subject": f"SLA penalty claim: {p['deliveries']:,} late deliveries, ${p['claim_usd']:,}", "body": body}


SYSTEM = (
    "You are the Carrier Claims Agent at Halcyon Logistics. Write a firm, polite claim letter to a carrier asking "
    "it to credit the SLA penalties Halcyon paid for late deliveries the carrier caused. Use ONLY the facts "
    "provided: every number must come from them, quote the example deliveries exactly, do not threaten, do not "
    "invent contract clauses, dates or amounts. Say the full list is attached. Ask them to credit the claim or to "
    "contact us within 14 days. Plain English, under 220 words. Reply with ONLY JSON: {\"subject\": string, "
    "\"body\": string}.")


def run_carrier_claim(ds, carrier_id: str, month: str | None = None, llm: LLMClient | None = None) -> dict:
    pack = claim_pack(ds, carrier_id, month)
    facts = {k: v for k, v in pack.items() if k != "lines"} | {"reply_within_days": 14}
    llm = llm or LLMClient()
    template = _template(pack)
    resp = llm.generate(agent=AGENT, system=SYSTEM, prompt=f"Facts:\n{json.dumps(facts, indent=2)}",
                        mock=lambda: json.dumps(template), tier="smart", max_tokens=1200, json_output=True)
    flags = list(resp.flags)
    try:
        out = extract_json(resp.text)
        letter = {"subject": str(out["subject"]), "body": str(out["body"])}
    except (ValueError, KeyError, TypeError):
        letter, flags = template, flags + ["llm_output_not_json_used_template"]
    bad = unverified_numbers(letter["subject"] + "\n" + letter["body"], facts)
    if bad:
        letter = template
        flags.append("unverified_numbers_used_template")
    if f"{pack['claim_usd']:,}" not in letter["body"]:
        letter["body"] += f"\n\n(Claim total: ${pack['claim_usd']:,})"
        flags.append("fact_appended_claim_total")
    letter["body"] = letter["body"].replace(DRAFT_NOTE, "").rstrip() + "\n\n" + DRAFT_NOTE
    return {"agent_run_id": resp.run_id, "agent_name": AGENT_NAME, "provider": resp.provider, "model": resp.model,
            "status": "draft", "requires_approval": True, "pack": pack, "letter": letter,
            "unverified_numbers": bad, "guardrail_flags": flags,
            "method": ("The claim pack (which deliveries, the evidence, the totals) comes from the data and a fixed "
                       "rule; the AI writes the letter. Any number not in the pack sends it back to the template.")}
