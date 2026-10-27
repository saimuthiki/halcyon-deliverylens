"""Weekly Brief Agent: a one-page Monday email to the COO and CFO.

The week's numbers (on time against last week and the 94% target, money lost, the at-risk clients, the main
causes, the worst lane, complaints) and the three actions come from the data and fixed rules. The model writes
the email. Every number in it must come from the facts, or the template is used and the reason flagged.

Sending goes through an Amazon SNS topic (WEEKLY_BRIEF_TOPIC_ARN) whose subscribers have confirmed by email;
the recipients are never taken from a request. A timer on the server sends it every Monday:
    python -m app.agents.weekly_brief send
"""
import json
import logging
import sys
import threading
import time

import pandas as pd

from app.agents.llm_client import LLMClient, extract_json
from app.analytics.causes import CAUSES, REALISTIC_EFFECTIVENESS
from app.analytics.roi import BENCHMARK
from app.config import get_settings
from app.guardrails import unverified_numbers

log = logging.getLogger(__name__)

AGENT = "weekly_brief"
AGENT_NAME = "Weekly Brief Agent"
TREND_WEEKS = 6
MIN_LANE_DELIVERIES = 20
SEND_COOLDOWN_S = 600  # "Send now" at most once every 10 minutes
SNS_SUBJECT_MAX = 100

SHORT = {"incomplete_address": "Incomplete addresses", "same_day_after_cutoff": "Same-day orders after 08:00",
         "stock_not_at_nearest": "Stock not at the nearest warehouse", "weak_carrier_lane": "Weak carrier lanes",
         "route_deviation": "Route deviation"}
ACTIONS = {
    "incomplete_address": ("Run every email order through the Order desk address check; fill gaps from the "
                           "client's delivery history and get a one-click confirmation.", "Customer Success"),
    "same_day_after_cutoff": ("Apply the same-day rules: grace period to {grace}, urgent orders only until {hard}.",
                              "Warehouse managers"),
    "stock_not_at_nearest": ("Move fast-moving stock to the warehouse nearest each region every month.",
                             "Inventory planning"),
    "weak_carrier_lane": ("Stop booking the weak lanes; use the best on-time carrier per region.", "Carrier manager"),
    "route_deviation": ("Review route deviation with the carriers that drift most.", "Carrier manager"),
}


class UnknownWeek(ValueError):
    pass


class NotConfigured(RuntimeError):
    pass


class TooSoon(RuntimeError):
    pass


def _week_start(ts: pd.Series) -> pd.Series:
    return ts.dt.to_period("W-SUN").dt.start_time


def available_weeks(ds) -> list[str]:
    return [d.date().isoformat() for d in sorted(_week_start(ds.deliveries.order_received_ts).unique())]


def _rate(late: pd.Series) -> float | None:
    return round(1 - float(late.mean()), 3) if len(late) else None


def brief_facts(ds, week_of: str | None = None) -> dict:
    df = ds.deliveries
    weeks = available_weeks(ds)
    week_of = week_of or weeks[-1]
    if week_of not in weeks:
        raise UnknownWeek(week_of)
    wk = _week_start(df.order_received_ts).dt.date.astype(str)
    i = weeks.index(week_of)
    this = df[wk == week_of]
    prev = df[wk == weeks[i - 1]] if i > 0 else this.iloc[0:0]
    last4 = df[wk.isin(weeks[max(0, i - 3):i + 1])]
    late = this[this.late]

    causes = []
    for c in CAUSES:
        n = int(late[c].sum())
        if n:
            causes.append({"cause": c, "label": SHORT[c], "late_deliveries": n,
                           "share_of_late": round(n / max(len(late), 1), 2)})
    causes.sort(key=lambda x: -x["late_deliveries"])

    lanes = this.groupby(["carrier_id", "destination_region"]).late.agg(["size", "mean"])
    lanes = lanes[lanes["size"] >= MIN_LANE_DELIVERIES]
    worst = None
    if len(lanes):
        (cid, region), row = next(iter(lanes.sort_values("mean", ascending=False).iterrows()))
        worst = {"carrier_id": cid, "region": region, "deliveries": int(row["size"]),
                 "on_time_rate": round(1 - float(row["mean"]), 3)}

    at_risk = this[this.client_id.isin(ds.at_risk_client_ids)]
    end = pd.Timestamp(week_of) + pd.Timedelta(days=6)
    cp = ds.complaints[(ds.complaints.complaint_date >= pd.Timestamp(week_of)) & (ds.complaints.complaint_date <= end)]
    on_time, before = _rate(this.late), _rate(prev.late)
    findings = {c["cause"]: c for c in ds.findings["causes"]}
    cfg = get_settings()
    actions = [{"cause": x["cause"], "owner": ACTIONS[x["cause"]][1],
                "action": ACTIONS[x["cause"]][0].format(grace=cfg.same_day_grace_until, hard=cfg.same_day_hard_stop),
                "points_if_fixed_six_months": findings[x["cause"]]["points_gained_if_fixed_alone"]}
               for x in causes[:3]]
    trend = [{"week_of": w, "on_time_rate": _rate(df[wk == w].late)} for w in weeks[max(0, i - TREND_WEEKS + 1):i + 1]]

    return {
        "week_of": week_of, "week_end": end.date().isoformat(), "latest_week_in_data": weeks[-1],
        "deliveries": int(len(this)), "late_deliveries": int(len(late)),
        "on_time_rate": on_time, "previous_week_on_time_rate": before,
        "change_points": round((on_time - before) * 100, 1) if before is not None else None,
        "four_week_on_time_rate": _rate(last4.late), "target_on_time_rate": BENCHMARK,
        "gap_to_target_points": round((BENCHMARK - on_time) * 100, 1),
        "sla_penalties_usd": int(this.penalty_usd.sum()), "redelivery_cost_usd": int(this.redelivery_cost_usd.sum()),
        "at_risk_clients": {"deliveries": int(len(at_risk)), "on_time_rate": _rate(at_risk.late),
                            "annual_revenue_usd": ds.findings["money"]["at_risk_annual_revenue_usd"]},
        "main_causes": causes[:3], "worst_lane": worst,
        "complaints": {"total": int(len(cp)), "by_category": {k: int(v) for k, v in cp.category.value_counts().items()}},
        "top_actions": actions,
        "projected_on_time_rate_with_fixes": round(ds.combos.expected(REALISTIC_EFFECTIVENESS), 3),
        "trend": trend,
    }


def _pct(x) -> str:
    return "n/a" if x is None else f"{x * 100:.1f}%"


def _template(f: dict) -> dict:
    change = ("" if f["change_points"] is None else
              f" ({'+' if f['change_points'] >= 0 else ''}{f['change_points']} points on last week)")
    subject = f"Halcyon on-time delivery, week of {f['week_of']}: {_pct(f['on_time_rate'])}"
    headline = (f"{_pct(f['on_time_rate'])} on time{change}, {f['gap_to_target_points']} points below the "
                f"{_pct(f['target_on_time_rate'])} target.")
    lines = [headline, "",
             "THE WEEK",
             f"- {f['deliveries']:,} deliveries, {f['late_deliveries']:,} late.",
             f"- 4-week average: {_pct(f['four_week_on_time_rate'])} on time.",
             f"- Money lost: ${f['sla_penalties_usd']:,} in SLA penalties and ${f['redelivery_cost_usd']:,} in redeliveries.",
             f"- At-risk clients: {_pct(f['at_risk_clients']['on_time_rate'])} on time across "
             f"{f['at_risk_clients']['deliveries']:,} deliveries (${f['at_risk_clients']['annual_revenue_usd']:,} a year at stake)."]
    if f["complaints"]["total"]:
        lines.append(f"- {f['complaints']['total']} new complaints.")
    lines += ["", "WHY DELIVERIES WERE LATE"]
    lines += [f"- {c['label']}: {c['late_deliveries']} late deliveries ({c['share_of_late'] * 100:.0f}% of late)."
              for c in f["main_causes"]]
    if f["worst_lane"]:
        w = f["worst_lane"]
        lines.append(f"- Worst lane: carrier {w['carrier_id']} to the {w['region']}, {_pct(w['on_time_rate'])} on time "
                     f"({w['deliveries']} deliveries).")
    lines += ["", "THREE ACTIONS FOR THIS WEEK"]
    lines += [f"{n}. {a['action']} Owner: {a['owner']}." for n, a in enumerate(f["top_actions"], 1)]
    lines += ["", f"With all five fixes in place we project {_pct(f['projected_on_time_rate_with_fixes'])} on time.",
              "", "DeliveryLens weekly brief"]
    return {"subject": subject, "headline": headline, "body": "\n".join(lines)}


SYSTEM = (
    "You are the Weekly Brief Agent at Halcyon Logistics. Write a one-page Monday email for the COO and CFO about "
    "last week's on-time delivery. Use ONLY the facts provided: every number you write must appear in the facts, "
    "and do not invent causes, actions, owners or results. Lead with the on-time rate against last week and the "
    "94% target, then the money lost, the at-risk clients, why deliveries were late, and the three actions "
    "(exactly the top_actions, with their owners). Plain English, short sentences, plain text with simple "
    "headings and '-' bullets, under 250 words. Reply with ONLY JSON: {\"subject\": string (under 90 "
    "characters), \"headline\": string (one sentence), \"body\": string}.")


def run_weekly_brief(ds, week_of: str | None = None, llm: LLMClient | None = None) -> dict:
    facts = brief_facts(ds, week_of)
    llm = llm or LLMClient()
    template = _template(facts)
    resp = llm.generate(agent=AGENT, system=SYSTEM, prompt=f"Facts:\n{json.dumps(facts, indent=2)}",
                        mock=lambda: json.dumps(template), tier="smart", max_tokens=1200, json_output=True)
    flags = list(resp.flags)
    try:
        out = extract_json(resp.text)
        brief = {"subject": str(out["subject"])[:SNS_SUBJECT_MAX], "headline": str(out["headline"]),
                 "body": str(out["body"])}
    except (ValueError, KeyError, TypeError):
        brief = template
        flags.append("llm_output_not_json_used_template")
    bad = unverified_numbers("\n".join(brief.values()), facts)
    if bad:
        brief = template
        flags.append("unverified_numbers_used_template")
    return {"agent_run_id": resp.run_id, "agent_name": AGENT_NAME, "provider": resp.provider, "model": resp.model,
            "week_of": facts["week_of"], "facts": facts, "brief": brief, "unverified_numbers": bad,
            "guardrail_flags": flags, "delivery": delivery_status(),
            "method": ("The numbers and the three actions come from the data and fixed rules; the AI writes the "
                       "email. Any number not in the facts sends it back to the template.")}


# ---------------------------------------------------------------- sending (Amazon SNS)
_last_sent = 0.0
_send_lock = threading.Lock()


def _sns():
    import boto3

    return boto3.client("sns", region_name=get_settings().aws_region)


def delivery_status() -> dict:
    arn = get_settings().weekly_brief_topic_arn
    if not arn:
        return {"configured": False, "confirmed_subscribers": 0,
                "note": "Set WEEKLY_BRIEF_TOPIC_ARN to send the brief by email."}
    try:
        subs = _sns().list_subscriptions_by_topic(TopicArn=arn)["Subscriptions"]
        confirmed = sum(1 for s in subs if s["SubscriptionArn"].startswith("arn:"))
        return {"configured": True, "confirmed_subscribers": confirmed, "pending_subscribers": len(subs) - confirmed,
                "schedule": "Every Monday at 07:00 US Central"}
    except Exception as exc:  # status only; never break the preview
        log.warning("could not read weekly brief subscribers: %s", exc)
        return {"configured": True, "confirmed_subscribers": None, "schedule": "Every Monday at 07:00 US Central"}


def send_brief(result: dict, *, enforce_cooldown: bool = True) -> dict:
    global _last_sent
    arn = get_settings().weekly_brief_topic_arn
    if not arn:
        raise NotConfigured("WEEKLY_BRIEF_TOPIC_ARN is not set")
    with _send_lock:
        wait = SEND_COOLDOWN_S - (time.time() - _last_sent)
        if enforce_cooldown and wait > 0:
            raise TooSoon(int(wait))
        b = result["brief"]
        msg = _sns().publish(TopicArn=arn, Subject=b["subject"][:SNS_SUBJECT_MAX], Message=b["body"])
        _last_sent = time.time()
    return {"sent": True, "message_id": msg["MessageId"], "week_of": result["week_of"], "subject": b["subject"]}


def _main(argv: list[str]) -> int:
    if argv[:1] != ["send"]:
        print("usage: python -m app.agents.weekly_brief send [WEEK_OF]")
        return 2
    from app.analytics.store import get_dataset

    result = run_weekly_brief(get_dataset(), argv[1] if len(argv) > 1 else None)
    print(json.dumps(send_brief(result, enforce_cooldown=False)))
    return 0


if __name__ == "__main__":
    sys.exit(_main(sys.argv[1:]))
