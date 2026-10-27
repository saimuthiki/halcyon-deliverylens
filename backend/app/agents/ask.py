"""Ask agent: answer leadership questions using fixed tool functions over the analytics.

The model never writes SQL. It picks tools from a fixed list; the tools return facts and numbers;
the answer must cite those numbers (checked after generation).
"""
import inspect
import json
import re

from app.agents.llm_client import LLMClient, extract_json, log_blocked
from app.agents.order_intake import GuardrailBlocked
from app.analytics import views
from app.analytics.causes import causes_of
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


REPORTED_NOTE = ("A complaint's category is the reason the client reported, not a verified root cause; the causes "
                 "come from the delivery data.")
NO_POLICY_NOTE = ("The dataset holds no policy or resolution records (no refund, credit or compensation rules and "
                  "no record of how complaints were resolved), so questions about policies or resolutions cannot "
                  "be answered from it.")
COMPLAINT_CATEGORY_WORDS = [
    ("Not told about the delay", r"not told|nobody told|notif|didn'?t tell|did not tell|communicat|warn|kept informed"),
    ("Redelivery needed", r"redeliver|re-deliver|did not arrive|didn'?t arrive|missing|never arrived|sent again"),
    ("Penalty dispute", r"dispute"),
]
MAX_LISTED_COMPLAINTS = 8
POLICY_WORDS = r"polic|refund|compensat|resolution|resolv|credit|procedure|playbook|what do we do"


def _client_ids_in(question: str, ds) -> list[str]:
    ids = {m.upper() for m in re.findall(r"\bc\d{3}\b", question, flags=re.I)}
    ids |= {f"C{int(n):03d}" for n in re.findall(r"\bclient\s+(\d{1,3})\b", question, flags=re.I)}
    return sorted(ids & set(ds.clients.client_id))


def tool_complaints(ds, question: str = ""):
    """Structured retrieval over the complaint log: filter by client / category, join delivery causes and client."""
    allc = ds.complaints
    total, not_told = len(allc), int((allc.category == "Not told about the delay").sum())
    clients = ds.clients.set_index("client_id")
    at_risk = ds.at_risk_client_ids

    q = question or ""
    ids = _client_ids_in(q, ds)
    cats = [c for c, rx in COMPLAINT_CATEGORY_WORDS if re.search(rx, q, flags=re.I)]
    sel = allc
    if ids:
        sel = sel[sel.client_id.isin(ids)]
    if cats:
        sel = sel[sel.category.isin(cats)]

    rows, cause_counts, known, days = [], {}, 0, []
    for c in sel.itertuples():
        d = ds.by_id.loc[c.delivery_id] if c.delivery_id in ds.by_id.index else None
        causes = causes_of(d) if d is not None else []
        if causes:
            known += 1
        for k in causes:
            cause_counts[k] = cause_counts.get(k, 0) + 1
        if d is not None:
            days.append(int(d.days_late))
        rows.append((c, d, causes))

    escalated = int((sel.escalated_to_account_owner == "Y").sum())
    from_at_risk = int(sel.client_id.isin(at_risk).sum())
    matched = len(sel)
    scope = []
    if ids:
        scope.append("client " + ", ".join(ids))
    if cats:
        scope.append("category " + ", ".join(f"'{c}'" for c in cats))

    policy_q = bool(re.search(POLICY_WORDS, q, flags=re.I))
    parts = [NO_POLICY_NOTE] if policy_q else []
    parts.append(f"The complaint log has {total} complaints; {not_told} of {total} are 'Not told about the delay' "
                 f"(by category: " + ", ".join(f"{k} {v}" for k, v in allc.category.value_counts().items()) + ").")
    if scope:
        parts.append(f"Matching {' and '.join(scope)}: {matched} of {total} complaints.")
    if matched:
        by_cat = ", ".join(f"{k} {v}" for k, v in sel.category.value_counts().items())
        top = sorted(cause_counts.items(), key=lambda kv: -kv[1])
        cause_txt = (f"of {known} with a known cause, the top cause is {top[0][0].replace('_', ' ')} "
                     f"({top[0][1]} of {known})" if top else "none has a tagged cause")
        untagged = matched - known
        parts.append(f"Pattern in {'these ' + str(matched) if scope else 'all ' + str(total)}: "
                     + (f"{by_cat}; " if scope else "") + f"{cause_txt}; {untagged} "
                     f"{'has' if untagged == 1 else 'have'} no tagged cause; "
                     f"{escalated} of {matched} were escalated to the account owner; {from_at_risk} of {matched} "
                     f"came from clients threatening to leave"
                     + (f"; the deliveries were {sum(days) / len(days):.1f} days late on average." if days else "."))
        if scope:
            picked, label = rows[:MAX_LISTED_COMPLAINTS], "Complaints"
        else:  # unfiltered: one representative per category beats the first N by date
            seen, picked = set(), []
            for r in rows:
                if r[0].category not in seen:
                    seen.add(r[0].category)
                    picked.append(r)
            label = "Complaints (one example per category; the texts are near-identical templates within a category)"
        listed = []
        for c, d, causes in picked:
            cl = clients.loc[c.client_id] if c.client_id in clients.index else None
            who = (f"{c.client_id} ({cl.client_name}, {cl.account_tier}"
                   + (", threatening to leave" if c.client_id in at_risk else "") + ")") if cl is not None else c.client_id
            dtxt = (f"delivery {c.delivery_id} by carrier {d.carrier_id} to {d.destination_region}, "
                    f"{int(d.days_late)} days late, causes found in the delivery data: "
                    + (", ".join(k.replace("_", " ") for k in causes) or "none tagged")) if d is not None \
                else f"delivery {c.delivery_id} not found"
            esc = "escalated" if c.escalated_to_account_owner == "Y" else "not escalated"
            listed.append(f"{c.complaint_id} {c.complaint_date:%Y-%m-%d} {who}, {c.channel}, client-reported reason "
                          f"'{c.category}', {esc}: "
                          f"\"{c.text}\" -> {dtxt}")
        more = f" (showing {len(listed)} of {matched})" if scope and matched > len(listed) else ""
        parts.append(label + more + ": " + " | ".join(listed) + ". " + REPORTED_NOTE)
    elif scope:
        parts.append("No complaints match.")
    if not policy_q:
        parts.append(NO_POLICY_NOTE)

    nums = {"complaints_total": str(total), "not_told_about_delay": str(not_told),
            "complaints_matched": str(matched), "complaints_escalated": str(escalated)}
    return " ".join(parts), nums


def _call_tool(fn, ds, question: str):
    if "question" in inspect.signature(fn).parameters:
        return fn(ds, question=question)
    return fn(ds)


TOOLS = {
    "complaints": ("Past complaints from the complaint log (filter by client or category) joined to delivery causes, "
                   "with the pattern; also states that no policy/resolution records exist", tool_complaints),
    "kpis": ("Headline on-time rate, volumes, penalties, redelivery cost, complaints, team hours", tool_kpis),
    "causes": ("The five causes of late deliveries with fair-share points and on-time rates", tool_causes),
    "scenarios": ("Projected on-time rate if routing-only, process-only or all causes are fixed", tool_scenarios),
    "carrier_scorecard": ("Carrier on-time by region, weak lanes, best carrier per region", tool_carrier_scorecard),
    "at_risk_clients": ("The clients threatening to leave: revenue, on-time rate, complaints", tool_at_risk_clients),
    "vendor_assessment": ("Whether to sign the $680K routing-optimisation contract", tool_vendor_assessment),
    "roi": ("Cost, savings, net benefit and payback of each option", tool_roi),
}

KEYWORDS = [
    ("complaints", r"complain|grievanc|escalat|polic|refund|compensat|resolution|resolv|credit note"),
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


# A number as a whole token: "$1,234", "73.2%", "12"; not the "12" in "112", "2026" or "CR12".
_NUMBER_TOKEN = re.compile(r"(?<![\w.])(?<!\d,)(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?!\w|[.,]\d)")
MIN_CITED_VALUE = 10  # small numbers (1, 3, 5...) turn up by chance, so they do not count as a citation


def _number_tokens(text: str) -> set[float]:
    return {float(m.group().replace(",", "")) for m in _NUMBER_TOKEN.finditer(str(text))}


def cites_a_number(answer: str, numbers: dict) -> bool:
    """True when the answer quotes, as a whole token, one of the tool numbers that is 10 or more."""
    wanted = {n for v in numbers.values() for n in _number_tokens(v) if abs(n) >= MIN_CITED_VALUE}
    return bool(wanted & _number_tokens(answer))


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
                         mock=lambda: json.dumps({"tools": fallback}), tier="fast", json_output=True)
    flags = list(route.flags)
    try:
        tools = [t for t in extract_json(route.text).get("tools", []) if t in TOOLS][:3]
    except (ValueError, AttributeError):
        tools = []
    if not tools:
        tools, flags = fallback, flags + ["route_fallback_keywords"]

    facts, numbers = {}, {}
    for t in tools:
        text, nums = _call_tool(TOOLS[t][1], ds, question)
        facts[t] = text
        numbers.update(nums)

    mock_answer = " ".join(facts[t] for t in tools)
    answer = llm.generate(agent=AGENT, system=ANSWER_SYSTEM, tier="smart", mock=lambda: mock_answer,
                          prompt=f"Question: {question}\n\nFacts from tools:\n{json.dumps(facts, indent=2)}")
    flags += answer.flags
    text = answer.text.strip()
    # Output guardrail: the answer must quote at least one of the numbers (10 or more) it was given.
    if not cites_a_number(text, numbers):
        text += "\n\nNumbers used: " + "; ".join(f"{k} = {v}" for k, v in numbers.items())
        flags.append("numbers_appended")
    return {"agent_run_id": answer.run_id, "route_run_id": route.run_id, "provider": answer.provider,
            "model": answer.model, "question": question, "answer": text, "tools_used": tools,
            "facts": facts, "numbers_used": numbers, "guardrail_flags": sorted(set(flags))}
