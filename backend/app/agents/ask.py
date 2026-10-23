"""Ask agent: answer leadership questions using fixed tool functions over the analytics.

The model never writes SQL. It picks tools from a fixed list; the tools return facts and numbers;
the answer must cite those numbers (checked after generation).
"""
import json
import re

from app.agents.llm_client import LLMClient, extract_json, log_blocked
from app.agents.order_intake import GuardrailBlocked
from app.analytics import views
from app.analytics.roi import roi_view
from app.analytics.vendor import vendor_assessment
from app.guardrails import check_input

AGENT = "ask"


def _pct(x: float) -> str:
    return f"{x:.1%}"


def tool_kpis(ds):
    k = views.kpis(ds)
    nums = {"on_time_rate": _pct(k["on_time_rate"]), "deliveries": k["deliveries"], "late": k["late"],
            "sla_penalties_6m_usd": k["sla_penalties_usd"], "redelivery_cost_6m_usd": k["redelivery_cost_usd"],
            "complaints": k["complaints_total"],
            "cs_hours_on_complaints_per_week": k["customer_success_hours"]["hours_on_complaints"]}
    text = (f"On-time delivery is {nums['on_time_rate']} across {k['deliveries']:,} deliveries ({k['late']:,} late) "
            f"from {k['period'][0]} to {k['period'][1]}. Six months cost ${k['sla_penalties_usd']:,} in SLA penalties "
            f"and ${k['redelivery_cost_usd']:,} in redeliveries. There were {k['complaints_total']} complaints, and "
            f"customer success spent {nums['cs_hours_on_complaints_per_week']} of "
            f"{k['customer_success_hours']['hours_total']:g} hours in a week on complaints.")
    return text, nums


def tool_causes(ds):
    rows = sorted(views.causes_view(ds)["causes"], key=lambda r: -r["fair_share_points"])
    nums = {r["cause"]: f"{r['fair_share_points']} pts" for r in rows}
    parts = [f"{r['label'].lower()} ({r['fair_share_points']} points, on time only {_pct(r['on_time_rate'])}, "
             f"{_pct(r['share_of_late'])} of late deliveries)" for r in rows]
    return "The five causes ranked by fair share of on-time points: " + "; ".join(parts) + ".", nums


def tool_scenarios(ds):
    s = views.causes_view(ds)["scenarios"]
    nums = {k: _pct(v) for k, v in s.items()}
    text = (f"Today {nums['today']}. Fixing only routing (weak carrier lanes + route deviation) reaches at most "
            f"{nums['routing_only']}; fixing only process causes (address, same-day cutoff, stock placement) "
            f"reaches at most {nums['process_only']}. All five fixes with realistic effectiveness reach "
            f"{nums['realistic']}; {nums['all_fixed']} is the ceiling if every fix is fully adopted.")
    return text, nums


def tool_carrier_scorecard(ds):
    sc = views.carrier_scorecard(ds)
    recs = sc["recommended_by_region"]
    nums = {f"best_{r}": f"{v['carrier_id']} {_pct(v['on_time_rate'])}" for r, v in recs.items()}
    lanes = ", ".join(f"{w['carrier_id']}-{w['region']}" for w in sc["weak_lanes"])
    text = ("Best carrier by region: " + "; ".join(f"{r}: carrier {v['carrier_id']} ({_pct(v['on_time_rate'])} on time)"
                                                   for r, v in recs.items())
            + f". Weak carrier lanes: {lanes}.")
    return text, nums


def tool_at_risk_clients(ds):
    c = views.at_risk_clients(ds)
    f = ds.findings
    nums = {"at_risk_clients": len(c["clients"]), "at_risk_revenue_usd": c["total_annual_revenue_usd"],
            "at_risk_on_time_rate": _pct(f["money"]["at_risk_on_time_rate"]),
            "complaints_from_at_risk": f["complaints"]["from_at_risk_clients"]}
    top = ", ".join(f"{x['client_name']} (${x['annual_revenue_usd']:,}, {_pct(x['on_time_rate'])} on time)"
                    for x in c["clients"][:3])
    text = (f"{nums['at_risk_clients']} clients worth ${nums['at_risk_revenue_usd']:,} a year are threatening to "
            f"leave; their on-time rate is {nums['at_risk_on_time_rate']} and they filed "
            f"{nums['complaints_from_at_risk']} of {f['complaints']['total']} complaints. Largest: {top}.")
    return text, nums


def tool_vendor_assessment(ds):
    v = vendor_assessment(ds)
    nums = {"routing_only_ceiling": _pct(v["routing_only_ceiling"]), "process_only": _pct(v["process_only"]),
            "all_fixed": _pct(v["all_fixed"]), "budget_usd": v["budget_usd"]}
    text = (f"{v['recommendation']}. A perfect routing product lifts on-time from {_pct(v['today'])} to "
            f"{nums['routing_only_ceiling']} (+{v['routing_only_points']} points) for ${v['budget_usd']:,}; "
            f"process fixes reach {nums['process_only']} and all fixes {nums['all_fixed']}.")
    return text, nums


def tool_roi(ds):
    r = roi_view(ds)
    by_name = {s["name"]: s for s in r["scenarios"]}
    real, vendor = by_name["All five fixes, realistic"], by_name["Routing vendor only (ceiling)"]
    nums = {"realistic_on_time": _pct(real["on_time_rate"]), "realistic_cost_per_year_usd": real["cost_per_year_usd"],
            "realistic_net_benefit_per_year_usd": real["net_benefit_per_year_usd"],
            "realistic_net_penalties_only_usd": real["net_benefit_penalties_only_usd"],
            "vendor_net_penalties_only_usd": vendor["net_benefit_penalties_only_usd"]}
    text = (f"All five fixes, realistic: {nums['realistic_on_time']} on time for about "
            f"${real['cost_per_year_usd']:,} a year; they avoid ${real['sla_penalties_avoided_usd']:,} of SLA "
            f"penalties and ${real['redelivery_avoided_usd']:,} of redelivery cost a year, a net benefit of "
            f"${real['net_benefit_per_year_usd']:,} (${real['net_benefit_penalties_only_usd']:,} on penalties alone). "
            f"The routing vendor alone costs ${vendor['cost_per_year_usd']:,} and nets "
            f"${vendor['net_benefit_penalties_only_usd']:,} on penalties alone. {r['assumptions']['note']}.")
    return text, nums


TOOLS = {
    "kpis": ("Headline on-time rate, volumes, penalties, redelivery cost, complaints, team hours", tool_kpis),
    "causes": ("The five causes of late deliveries with fair-share points and on-time rates", tool_causes),
    "scenarios": ("Projected on-time rate if routing-only, process-only or all causes are fixed", tool_scenarios),
    "carrier_scorecard": ("Carrier on-time by region, weak lanes, best carrier per region", tool_carrier_scorecard),
    "at_risk_clients": ("The clients threatening to leave: revenue, on-time rate, complaints", tool_at_risk_clients),
    "vendor_assessment": ("Whether to sign the $680K routing-optimisation contract", tool_vendor_assessment),
    "roi": ("Cost, savings, net benefit and payback of each option", tool_roi),
}

KEYWORDS = [
    ("roi", r"payback|roi|return|net benefit|worth it|plan cost|cost of the plan|invest"),
    ("vendor_assessment", r"vendor|contract|sign|routing (?:product|tool|software|optimi)|680"),
    ("scenarios", r"what if|scenario|if we fix|fix everything|all fixed|ceiling|realistic|projected|could we reach"),
    ("causes", r"cause|why|reason|biggest|driver|fix first|root"),
    ("carrier_scorecard", r"carrier|lane|region"),
    ("at_risk_clients", r"client|customer|at[- ]risk|leav|churn|revenue"),
    ("kpis", r"penalt|cost|money|complain|kpi|on[- ]time|otd|overall|how bad|hours"),
]


def route_by_keywords(question: str) -> list[str]:
    q = question.lower()
    tools = [name for name, rx in KEYWORDS if re.search(rx, q)]
    return tools[:3] or ["kpis", "causes"]


ROUTE_SYSTEM = ("You route a business question to analytics tools. Reply with ONLY JSON {\"tools\": [names]} "
                "choosing 1-3 names from this list:\n" + "\n".join(f"- {k}: {d}" for k, (d, _) in TOOLS.items()))
ANSWER_SYSTEM = ("You answer Halcyon Logistics leadership questions using ONLY the facts provided by tools. "
                 "Quote the exact numbers you rely on. Do not invent numbers. If the facts do not answer the "
                 "question, say so. Under 120 words, plain English.")


def run_ask(ds, question: str, llm: LLMClient | None = None) -> dict:
    guard = check_input(question)
    if guard.blocked:
        raise GuardrailBlocked(guard.flags, guard.reason or "blocked", log_blocked(AGENT, question, guard.flags))
    llm = llm or LLMClient()
    fallback = route_by_keywords(question)
    route = llm.generate(agent=f"{AGENT}.route", system=ROUTE_SYSTEM, prompt=f"Question: {question}",
                         mock=lambda: json.dumps({"tools": fallback}), tier="fast")
    flags = list(route.flags)
    try:
        tools = [t for t in extract_json(route.text).get("tools", []) if t in TOOLS][:3]
    except (ValueError, AttributeError):
        tools = []
    if not tools:
        tools, flags = fallback, flags + ["route_fallback_keywords"]

    facts, numbers = {}, {}
    for t in tools:
        text, nums = TOOLS[t][1](ds)
        facts[t] = text
        numbers.update(nums)

    mock_answer = " ".join(facts[t] for t in tools)
    answer = llm.generate(agent=AGENT, system=ANSWER_SYSTEM, tier="smart", mock=lambda: mock_answer,
                          prompt=f"Question: {question}\n\nFacts from tools:\n{json.dumps(facts, indent=2)}")
    flags += answer.flags
    text = answer.text.strip()
    # Output guardrail: the answer must quote at least one of the numbers it was given.
    if not any(str(v).split()[0].rstrip("%") in text for v in numbers.values()):
        text += "\n\nNumbers used: " + "; ".join(f"{k} = {v}" for k, v in numbers.items())
        flags.append("numbers_appended")
    return {"agent_run_id": answer.run_id, "route_run_id": route.run_id, "provider": answer.provider,
            "model": answer.model, "question": question, "answer": text, "tools_used": tools,
            "facts": facts, "numbers_used": numbers, "guardrail_flags": sorted(set(flags))}
