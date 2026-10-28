"""Weekly Brief Agent: a one-page Monday email to the COO and CFO.

The week's numbers (on time against last week and the 94% target, money lost, the at-risk clients, the main
causes, the worst lane, complaints) and the three actions come from the data and fixed rules. The model writes
the email. Every number in it must come from the facts, or the template is used and the reason flagged.

The email is rendered from templates (app/email/templates/weekly_brief.html and .txt): the AI writes only the
headline and a short commentary; every table and figure comes from the facts.

Sending goes through the shared email service (app.email.send_email). The default backend is an Amazon SNS topic
(WEEKLY_BRIEF_TOPIC_ARN) whose subscribers have confirmed by email; SNS sends the plain-text version. Other
backends send to WEEKLY_BRIEF_TO / _CC / _BCC. Either way the recipients are never taken from a request. A timer
on the server sends it every Monday:
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
from app.email import (EmailConfigError, EmailMessage, describe, get_backend, missing_recipients, recipients_for,
                       render_email, send_email)
from app.email.backends import SnsBackend
from app.email.dedupe import AlreadySent, send_date
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
    """Subject, headline and commentary written by rules. The subject is always this one; the headline and
    commentary are the fallback when the AI's text cannot be used."""
    change = ("" if f["change_points"] is None else
              f" ({'+' if f['change_points'] >= 0 else ''}{f['change_points']} points on last week)")
    subject = f"Halcyon on-time delivery, week of {f['week_of']}: {_pct(f['on_time_rate'])}"
    headline = (f"{_pct(f['on_time_rate'])} on time{change}, {f['gap_to_target_points']} points below the "
                f"{_pct(f['target_on_time_rate'])} target.")
    commentary = [f"{f['deliveries']:,} deliveries this week, {f['late_deliveries']:,} of them late."]
    if f["main_causes"]:
        c = f["main_causes"][0]
        commentary.append(f"{c['label']} caused the most late deliveries ({c['late_deliveries']:,}).")
    commentary.append(f"At-risk clients were {_pct(f['at_risk_clients']['on_time_rate'])} on time; "
                      f"the 4-week average is {_pct(f['four_week_on_time_rate'])}.")
    return {"subject": subject, "headline": headline, "commentary": " ".join(commentary)}


def web_link(week_of: str) -> str:
    """The brief on the website, at its week; the plain-text (SNS) email links here for the formatted version."""
    return f"{get_settings().public_site_url}/weekly-brief?week={week_of}"


def _compose(f: dict, subject: str, headline: str, commentary: str) -> dict:
    """The finished brief: AI or template headline and commentary; every table and figure from the facts."""
    ctx = {"f": f, "subject": subject, "brief": {"headline": headline, "commentary": commentary},
           "web_url": web_link(f["week_of"])}
    rendered = render_email("weekly_brief", ctx)
    return {"subject": subject, "headline": headline, "commentary": commentary,
            "body": rendered.text, "html": rendered.html}


SYSTEM = (
    "You are the Weekly Brief Agent at Halcyon Logistics. Write the opening of a Monday email for the COO and "
    "CFO about last week's on-time delivery. The email's tables and figures are added from the data; you write "
    "only a headline and a short commentary. Use ONLY the facts provided: every number you write must appear "
    "in the facts, and do not invent causes, actions, owners or results. The headline is one sentence with the "
    "on-time rate against last week and the 94% target. The commentary is 2-3 plain sentences (under 70 words) "
    "on what mattered most this week: the main cause of late deliveries, the at-risk clients, or the trend. "
    "Plain text, no lists, no markdown. Reply with ONLY JSON: {\"headline\": string, \"commentary\": string}.")


def run_weekly_brief(ds, week_of: str | None = None, llm: LLMClient | None = None) -> dict:
    facts = brief_facts(ds, week_of)
    llm = llm or LLMClient()
    template = _template(facts)
    resp = llm.generate(agent=AGENT, system=SYSTEM, prompt=f"Facts:\n{json.dumps(facts, indent=2)}",
                        mock=lambda: json.dumps({"headline": template["headline"],
                                                 "commentary": template["commentary"]}),
                        tier="smart", max_tokens=600, json_output=True)
    flags = list(resp.flags)
    headline, commentary = template["headline"], template["commentary"]
    try:
        out = extract_json(resp.text)
        headline, commentary = str(out["headline"]).strip(), str(out["commentary"]).strip()
        if not headline or not commentary:
            raise ValueError("empty headline or commentary")
    except (ValueError, KeyError, TypeError):
        headline, commentary = template["headline"], template["commentary"]
        flags.append("llm_output_not_json_used_template")
    bad = unverified_numbers(f"{headline}\n{commentary}", facts)
    if bad:
        headline, commentary = template["headline"], template["commentary"]
        flags.append("unverified_numbers_used_template")
    brief = _compose(facts, template["subject"][:SNS_SUBJECT_MAX], headline, commentary)
    return {"agent_run_id": resp.run_id, "agent_name": AGENT_NAME, "provider": resp.provider, "model": resp.model,
            "week_of": facts["week_of"], "facts": facts, "brief": brief, "unverified_numbers": bad,
            "guardrail_flags": flags, "delivery": delivery_status(),
            "method": ("The numbers, tables and the three actions come from the data and fixed rules; the AI writes "
                       "only the headline and a short commentary. Any number in them that is not in the facts "
                       "sends both back to the template.")}


# ---------------------------------------------------------------- sending (app.email; SNS by default)
_last_sent = 0.0
_send_lock = threading.Lock()
SCHEDULE = "Every Monday at 07:00 US Central"
RECIPIENT_LIST = "weekly_brief"  # WEEKLY_BRIEF_TO / _CC / _BCC, used by backends that address recipients


def _sns():
    import boto3

    return boto3.client("sns", region_name=get_settings().aws_region)


def _backend():
    """The configured email backend for the brief. SNS (the default) sends to the brief topic's confirmed
    subscribers; other backends send to the server-side recipient list."""
    try:
        backend = get_backend(sns_topic_arn=get_settings().weekly_brief_topic_arn, sns_client_factory=lambda: _sns())
    except EmailConfigError as exc:
        if "topic ARN" in str(exc):
            raise NotConfigured("WEEKLY_BRIEF_TOPIC_ARN is not set") from None
        raise NotConfigured(str(exc)) from None
    missing = missing_recipients(RECIPIENT_LIST) if backend.addresses_recipients else None
    if missing:
        raise NotConfigured(missing)
    return backend


def delivery_status() -> dict:
    info = describe(RECIPIENT_LIST)
    if info["backend"] != "sns":
        available = info["backend"] in ("console", "memory", "brevo", "smtp")
        configured = available and not info["missing"]
        note = None if configured else (info["missing"] if available else
                                        f"EMAIL_BACKEND={info['backend']} is not available yet")
        return {"configured": configured, "backend": info["backend"], "recipients": info["recipients"],
                "test_mode": info["test_mode"], "schedule": SCHEDULE, **({"note": note} if note else {})}
    arn = get_settings().weekly_brief_topic_arn
    if not arn:
        return {"configured": False, "backend": "sns", "confirmed_subscribers": 0,
                "note": "Set WEEKLY_BRIEF_TOPIC_ARN to send the brief by email."}
    try:
        subs = SnsBackend(arn, lambda: _sns()).subscribers()
        return {"configured": True, "backend": "sns", "confirmed_subscribers": subs["confirmed"],
                "pending_subscribers": subs["pending"], "schedule": SCHEDULE}
    except Exception as exc:  # status only; never break the preview
        log.warning("could not read weekly brief subscribers: %s", exc)
        return {"configured": True, "backend": "sns", "confirmed_subscribers": None, "schedule": SCHEDULE}


def brief_message(result: dict) -> EmailMessage:
    b, r = result["brief"], recipients_for(RECIPIENT_LIST)
    return EmailMessage(subject=b["subject"], text_body=b["body"], html_body=b.get("html"),
                        to=r.to, cc=r.cc, bcc=r.bcc, category="weekly_brief")


def send_key(week_of: str) -> str:
    """One brief per reporting week per send date (warehouse time): the timer and "Send now" on the same day
    share it, and next Monday's send gets a new key even though the data's latest week does not change."""
    return f"weekly_brief:{week_of}:{send_date().isoformat()}"


def send_brief(result: dict, *, enforce_cooldown: bool = True, resend: bool = False, trigger: str = "api") -> dict:
    """Send the brief once. Raises NotConfigured, TooSoon, or AlreadySent (sent, or being sent, for this week
    today); resend=True sends again on purpose."""
    global _last_sent
    backend = _backend()
    message = brief_message(result)
    key = send_key(result["week_of"])
    with _send_lock:
        wait = SEND_COOLDOWN_S - (time.time() - _last_sent)
        if enforce_cooldown and wait > 0:
            raise TooSoon(int(wait))
        sent = send_email(message, backend=backend, idempotency_key=key, trigger=trigger, resend=resend)
        _last_sent = time.time()
    return {"sent": True, "message_id": sent.message_id, "week_of": result["week_of"],
            "subject": result["brief"]["subject"], "backend": sent.provider, "resend": resend}


USAGE = "usage: python -m app.agents.weekly_brief send [WEEK_OF] [--resend]"


def _main(argv: list[str]) -> int:
    """The Monday timer runs `send`. `--resend` sends again on purpose (run by hand on the server)."""
    args = [a for a in argv if a != "--resend"]
    resend = len(args) != len(argv)
    if args[:1] != ["send"] or len(args) > 2:
        print(USAGE)
        return 2
    from app.analytics.store import get_dataset

    result = run_weekly_brief(get_dataset(), args[1] if len(args) > 1 else None)
    try:
        out = send_brief(result, enforce_cooldown=False, resend=resend, trigger="cli" if resend else "timer")
    except AlreadySent as exc:  # e.g. someone pressed "Send now" this morning: not an error for the timer
        out = {"sent": False, "reason": f"already {exc.status}", "key": exc.key,
               "hint": "add --resend to send it again on purpose"}
    print(json.dumps(out))
    return 0


if __name__ == "__main__":
    sys.exit(_main(sys.argv[1:]))
