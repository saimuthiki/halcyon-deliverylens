"""Account Save Agent: a one-page save plan for each client that is threatening to leave.

The facts (deliveries, causes, penalties, complaints, the projected on-time rate after the fixes) and the
commitments we can offer come from the data and fixed rules. The model writes the wording only: a summary
for the account owner, talking points, a meeting agenda and an email inviting the client to a review.

Output guardrails: every number in the AI text must come from the facts, and the client email may not claim
an action that has not been taken. Either failure falls back to the template, and the reason is flagged.
The plan is a draft for the account owner; nothing is sent.
"""
import json

from app.agents.delay_alert import ACTION_CLAIM_RE
from app.agents.llm_client import LLMClient, extract_json
from app.analytics.causes import CAUSES, REALISTIC_EFFECTIVENESS
from app.analytics.roi import BENCHMARK
from app.guardrails import unverified_numbers

AGENT = "account_plan"
AGENT_NAME = "Account Save Agent"
DRAFT_NOTE = "DRAFT: for the account owner to review before anything is sent."
RECENT_COMPLAINTS = 3
MEETING_MINUTES = 30
REVIEW_DAYS = 90
SHORT = {"incomplete_address": "Incomplete address", "same_day_after_cutoff": "Same-day order after 08:00",
         "stock_not_at_nearest": "Stock not at the nearest warehouse", "weak_carrier_lane": "Weak carrier lane",
         "route_deviation": "Route deviation"}

# What DeliveryLens changes for each cause, and who owns it. A commitment we can make, not a claim it is done.
FIXES = {
    "incomplete_address": ("Every email order will be checked for a full address before picking; a missing "
                           "detail is filled from your delivery history and you confirm it with one click.",
                           "Order desk"),
    "same_day_after_cutoff": ("Same-day orders that arrive shortly after 08:00 will still go on that day's pick "
                              "list, and urgent ones until the hard stop.", "Warehouse"),
    "stock_not_at_nearest": ("Your fast-moving items will be restocked at the warehouse nearest you every month "
                             "instead of every quarter.", "Inventory planning"),
    "weak_carrier_lane": ("Your deliveries will go with the best on-time carrier for your region, never a "
                          "weak lane.", "Carrier manager"),
    "route_deviation": ("Route deviation on your lanes will be reviewed with the carrier every week.",
                        "Carrier manager"),
}


class NotAtRisk(ValueError):
    pass


def account_facts(ds, client_id: str) -> dict:
    clients = ds.clients.set_index("client_id")
    if client_id not in clients.index:
        raise KeyError(client_id)
    if client_id not in ds.at_risk_client_ids:
        raise NotAtRisk(client_id)
    c = clients.loc[client_id]
    df = ds.deliveries
    sel = (df.client_id == client_id).to_numpy()
    d = df[sel]
    late = d[d.late]
    company = 1 - float(df.late.mean())

    causes = []
    for cause, label in CAUSES.items():
        n = int(late[cause].sum())
        if n:
            causes.append({"cause": cause, "label": SHORT[cause], "late_deliveries": n,
                           "share_of_their_late": round(n / max(len(late), 1), 2),
                           "fix": FIXES[cause][0], "owner": FIXES[cause][1]})
    causes.sort(key=lambda x: -x["late_deliveries"])

    months = (d.assign(month=d.order_received_ts.dt.strftime("%Y-%m")).groupby("month").late.mean())
    cp = ds.complaints[ds.complaints.client_id == client_id].sort_values("complaint_date")
    recent = [{"date": r.complaint_date.date().isoformat(), "category": r.category, "text": r.text}
              for r in cp.tail(RECENT_COMPLAINTS).itertuples()]

    counts = ds.combos.counts_for(sel)
    realistic = ds.combos.expected(REALISTIC_EFFECTIVENESS, counts)
    carriers = (d.groupby("carrier_id").late.agg(["size", "mean"]).sort_values("size", ascending=False))
    main_carrier = carriers.index[0]

    commitments = [f"A named Customer Success contact and a weekly on-time report for the next {REVIEW_DAYS} days.",
                   "A delay alert from us on any shipment at risk of being late, before you have to chase it."]
    commitments += [x["fix"] for x in causes[:3]]

    return {
        "client_id": client_id, "client_name": c.client_name, "region": c.region, "account_tier": c.account_tier,
        "order_channel": c.primary_order_channel, "annual_revenue_usd": int(c.annual_revenue_usd),
        "sla_penalty_clause": c.sla_penalty_clause == "Y",
        "period": [str(df.order_received_ts.min().date()), str(df.order_received_ts.max().date())],
        "deliveries": int(len(d)), "late_deliveries": int(len(late)),
        "on_time_rate": round(1 - float(d.late.mean()), 3),
        "company_on_time_rate": round(company, 3), "benchmark_on_time_rate": BENCHMARK,
        "on_time_by_month": [{"month": m, "on_time_rate": round(1 - float(v), 3)} for m, v in months.items()],
        "causes_of_their_late_deliveries": causes,
        "sla_penalties_paid_usd": int(d.penalty_usd.sum()),
        "redelivery_cost_usd": int(d.redelivery_cost_usd.sum()),
        "complaints": {"total": int(len(cp)), "escalated_to_account_owner": int((cp.escalated_to_account_owner == "Y").sum()),
                       "by_category": {k: int(v) for k, v in cp.category.value_counts().items()},
                       "most_recent": recent},
        "main_carrier": {"carrier_id": main_carrier, "deliveries": int(carriers.loc[main_carrier, "size"]),
                         "on_time_rate": round(1 - float(carriers.loc[main_carrier, "mean"]), 3)},
        "weak_lane_share_of_deliveries": round(float(d.weak_carrier_lane.mean()), 2),
        "projected_on_time_rate_with_fixes": round(realistic, 3),
        "commitments_we_can_offer": commitments,
        "meeting_minutes": MEETING_MINUTES, "review_days": REVIEW_DAYS,
    }


def _pct(x: float) -> str:
    return f"{x * 100:.0f}%"


def _template(f: dict) -> dict:
    top = f["causes_of_their_late_deliveries"][:3]
    cause_txt = "; ".join(f"{x['label'].lower()} ({x['late_deliveries']} late deliveries)" for x in top) or "no single cause"
    mins, days = f["meeting_minutes"], f["review_days"]
    worst = min(f["on_time_by_month"], key=lambda m: m["on_time_rate"]) if f["on_time_by_month"] else None
    penalties = (f" Halcyon paid them ${f['sla_penalties_paid_usd']:,} in SLA penalties." if f["sla_penalty_clause"]
                 else "")
    summary = (f"{f['client_name']} ({f['account_tier']}, ${f['annual_revenue_usd']:,} a year) received "
               f"{_pct(f['on_time_rate'])} of {f['deliveries']:,} deliveries on time, against "
               f"{_pct(f['company_on_time_rate'])} for all clients and the {_pct(f['benchmark_on_time_rate'])} "
               f"benchmark.{penalties} The main causes: {cause_txt}. With the fixes in place we project "
               f"{_pct(f['projected_on_time_rate_with_fixes'])} on time for them.")
    points = [f"Acknowledge it plainly: {f['late_deliveries']:,} late deliveries in six months, "
              f"{f['complaints']['total']} complaints."]
    if worst:
        points.append(f"Their worst month was {worst['month']} at {_pct(worst['on_time_rate'])} on time.")
    points += [f"{x['label']}: {x['fix']}" for x in top]
    points.append(f"Projected on-time rate with the fixes: {_pct(f['projected_on_time_rate_with_fixes'])}.")
    agenda = ["What went wrong, in their own complaints and our numbers",
              "The causes we found and what will change for them",
              f"Our commitments for the next {days} days",
              "How we will report progress every week",
              "Agree the next review date"]
    body = (f"Dear {f['client_name']} team,\n\n"
            f"You have had too many late deliveries from us: {f['late_deliveries']:,} of {f['deliveries']:,} in "
            "the last six months. We have looked at every one of them and found the causes.\n\n"
            f"We would like {mins} minutes with you to walk through what we found and what will change:\n"
            + "\n".join(f"- {x}" for x in f["commitments_we_can_offer"])
            + "\n\nPlease reply with a time that suits you this week.\n\nKind regards,\nYour Halcyon Logistics account team")
    return {"summary": summary, "talking_points": points, "agenda": agenda,
            "email_subject": "Your deliveries from Halcyon: what we found and what will change",
            "email_body": body}


SYSTEM = (
    "You are the Account Save Agent at Halcyon Logistics. You write a save plan for the account owner of a "
    "business client that is threatening to leave because of late deliveries. Use ONLY the facts provided: every "
    "number you write must appear in the facts, and you must not invent compensation, discounts, credits, dates "
    "or promises. The commitments you may offer are exactly those in commitments_we_can_offer. In the client email "
    "never say an action has already been taken; describe the commitments as what we will do. Plain, direct "
    "English, no jargon. Reply with ONLY JSON: {\"summary\": string (max 80 words, for the account owner), "
    "\"talking_points\": [4-6 short strings], \"agenda\": [4-6 short strings], \"email_subject\": string, "
    "\"email_body\": string (max 170 words, to the client, inviting them to a review of meeting_minutes minutes)}.")


def _texts(plan: dict) -> str:
    return "\n".join([plan["summary"], *plan["talking_points"], *plan["agenda"], plan["email_subject"], plan["email_body"]])


def run_account_plan(ds, client_id: str, llm: LLMClient | None = None) -> dict:
    facts = account_facts(ds, client_id)
    llm = llm or LLMClient()
    template = _template(facts)
    resp = llm.generate(agent=AGENT, system=SYSTEM, prompt=f"Facts:\n{json.dumps(facts, indent=2)}",
                        mock=lambda: json.dumps(template), tier="smart", max_tokens=1500, json_output=True)
    flags = list(resp.flags)
    try:
        out = extract_json(resp.text)
        plan = {"summary": str(out["summary"]), "talking_points": [str(x) for x in out["talking_points"]][:6],
                "agenda": [str(x) for x in out["agenda"]][:6], "email_subject": str(out["email_subject"]),
                "email_body": str(out["email_body"])}
    except (ValueError, KeyError, TypeError):
        plan = template
        flags.append("llm_output_not_json_used_template")
    bad = unverified_numbers(_texts(plan), facts)
    if bad:
        plan = template
        flags.append("unverified_numbers_used_template")
    elif ACTION_CLAIM_RE.search(plan["email_body"]):
        plan = {**plan, "email_subject": template["email_subject"], "email_body": template["email_body"]}
        flags.append("action_claim_replaced")
    plan["email_body"] = plan["email_body"].replace(DRAFT_NOTE, "").rstrip() + "\n\n" + DRAFT_NOTE
    return {"agent_run_id": resp.run_id, "agent_name": AGENT_NAME, "provider": resp.provider, "model": resp.model,
            "client_id": client_id, "status": "draft", "requires_approval": True, "facts": facts, "plan": plan,
            "unverified_numbers": bad, "guardrail_flags": flags,
            "method": ("Facts, causes, the projected on-time rate and the commitments come from the data and fixed "
                       "rules; the AI writes the wording. Any number not in the facts sends the plan back to the "
                       "template.")}
