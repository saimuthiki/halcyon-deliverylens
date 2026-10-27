"""Same-day orders that miss the 08:00 pick list: a grace period, then urgent orders only, then a hard stop.

The 08:00 pick-list cutoff stays. Two configurable times (SAME_DAY_GRACE_UNTIL, SAME_DAY_HARD_STOP) decide
which late same-day orders are still added to today's pick list:

- grace (08:00 to grace_until, default 09:00): every same-day order with a complete address is added.
- urgent window (grace_until to hard_stop, default 10:00): only urgent orders are added:
    - the email gives a valid reason (verified high urgency, such as a stopped line or a fixed deadline),
      from any client; or
    - the email says it is urgent (verified medium urgency) and the client is a priority client:
      Tier 1 (at least $1M revenue a year) or at risk of leaving.
- from hard_stop: tomorrow's pick list, re-promised as next-day.

The AI only reads the urgency and quotes the sentence; code checks the quote, and these rules decide.
The replay below measures each window on the 4,826 historical same-day orders received after 08:00.
"""
import re
import threading
from copy import deepcopy

import numpy as np
import pandas as pd

from app.analytics.causes import PICK_LIST_CUTOFF_MINUTES
from app.analytics.combos import BIT
from app.analytics.roi import ANNUALISE

PICK_LIST_CUTOFF = "08:00"
DEFAULT_GRACE_UNTIL = "09:00"
DEFAULT_HARD_STOP = "10:00"
LATEST_TIME = "14:00"  # same-day orders arrive until 13:59 in the data
TIME_STEP_MINUTES = 30
SAME_DAY_BIT = BIT["same_day_after_cutoff"]
_HHMM = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")

WINDOWS = {
    "before_cutoff": "Before the 08:00 pick-list cutoff",
    "grace": "Grace period",
    "urgent_window": "Urgent orders only",
    "after_hard_stop": "After the hard stop",
}


def minutes_of(hhmm: str) -> int:
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def hhmm(minutes: int) -> str:
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def check_times(grace_until: str, hard_stop: str) -> None:
    """08:00 <= grace_until <= hard_stop <= 14:00, on the half hour. Raises ValueError."""
    for name, v in (("grace_until", grace_until), ("hard_stop", hard_stop)):
        if not isinstance(v, str) or not _HHMM.match(v):
            raise ValueError(f"{name} must be HH:MM, got {v!r}")
        if minutes_of(v) % TIME_STEP_MINUTES:
            raise ValueError(f"{name} must be on the hour or half hour, got {v}")
    if not minutes_of(PICK_LIST_CUTOFF) <= minutes_of(grace_until) <= minutes_of(hard_stop) <= minutes_of(LATEST_TIME):
        raise ValueError(f"times must satisfy {PICK_LIST_CUTOFF} <= grace_until ({grace_until}) <= hard_stop "
                         f"({hard_stop}) <= {LATEST_TIME}")


def priority_client(tier: str | None, at_risk: bool) -> str | None:
    """Why the client is a priority client, or None."""
    if at_risk:
        return "at risk of leaving"
    if tier == "Tier 1":
        return "Tier 1 (at least $1M revenue a year)"
    return None


def window_of(minutes: int, grace_until: str, hard_stop: str) -> str:
    if minutes < PICK_LIST_CUTOFF_MINUTES:
        return "before_cutoff"
    if minutes < minutes_of(grace_until):
        return "grace"
    if minutes < minutes_of(hard_stop):
        return "urgent_window"
    return "after_hard_stop"


def same_day_decision(minutes: int, *, tier: str | None, at_risk: bool, urgency: str,
                      grace_until: str, hard_stop: str) -> dict:
    """Is a same-day order with a complete address added to today's pick list? `urgency` must already be
    evidence-checked (an unverified claim is "none")."""
    window = window_of(minutes, grace_until, hard_stop)
    pc = priority_client(tier, at_risk)
    if window == "before_cutoff":
        today, why = True, "it arrived before the 08:00 pick-list cutoff"
    elif window == "grace":
        today, why = True, f"it arrived in the grace period (08:00 to {grace_until})"
    elif window == "after_hard_stop":
        today, why = False, f"it arrived after the {hard_stop} hard stop, when every order goes to tomorrow"
    elif urgency == "high":
        today, why = True, "the email gives a valid reason for the urgency"
    elif urgency == "medium" and pc:
        today, why = True, f"the email says it is urgent and the client is a priority client ({pc})"
    elif urgency == "medium":
        today, why = False, ("the email says it is urgent but gives no reason, and the client is not a priority "
                             "client (Tier 1 or at risk)")
    else:
        today, why = False, f"between {grace_until} and {hard_stop} only urgent orders are added, and this email is not urgent"
    return {"window": window, "window_label": WINDOWS[window], "added_today": today, "reason": why,
            "priority_client": pc}


def decision_rules(grace_until: str, hard_stop: str) -> list[dict]:
    """The rule table shown on the page, in the order it is applied."""
    return [
        {"when": "Before 08:00", "email": "Any", "client": "Any", "result": "today",
         "actor": "Rule", "note": "The normal pick list."},
        {"when": f"08:00 to {grace_until}", "email": "Any", "client": "Any", "result": "today",
         "actor": "Rule", "note": "Grace period."},
        {"when": f"{grace_until} to {hard_stop}", "email": "Urgent with a valid reason", "client": "Any",
         "result": "today", "actor": "AI agent",
         "note": "The AI quotes the sentence (for example a stopped line); code checks it is in the email."},
        {"when": f"{grace_until} to {hard_stop}", "email": "Says urgent, no reason", "client": "Tier 1 or at risk",
         "result": "today", "actor": "AI agent", "note": "Priority clients only."},
        {"when": f"{grace_until} to {hard_stop}", "email": "Says urgent, no reason", "client": "Other clients",
         "result": "tomorrow", "actor": "Rule", "note": "Shouting 'URGENT' is not enough."},
        {"when": f"{grace_until} to {hard_stop}", "email": "Not urgent", "client": "Any", "result": "tomorrow",
         "actor": "Rule", "note": "Even for priority clients."},
        {"when": f"From {hard_stop}", "email": "Any", "client": "Any", "result": "tomorrow",
         "actor": "Rule", "note": "Hard stop."},
    ]


# ---------------------------------------------------------------- SLA penalty per late delivery
def _penalty_per_late(ds) -> dict:
    df, c = ds.deliveries, ds.clients
    sla_ids = set(c.loc[c.sla_penalty_clause == "Y", "client_id"])
    sla = df[df.client_id.isin(sla_ids)]
    g = sla.groupby("client_id").agg(pen=("penalty_usd", "sum"), late=("late", "sum"))
    fallback = float(sla.penalty_usd.sum()) / max(int(sla.late.sum()), 1)
    return {cid: float(g.pen[cid]) / int(g.late[cid]) if cid in g.index and g.late[cid] else fallback
            for cid in sla_ids}


def expected_penalty_per_late(ds, client_id: str) -> float:
    """Expected SLA penalty per late delivery for this client: its penalties / its late deliveries.
    A client with an SLA clause but no late delivery uses the same ratio across all SLA-clause clients;
    a client without the clause is 0."""
    with _lock:
        cache = _cache_for(ds)
        if "penalty_per_late" not in cache:
            cache["penalty_per_late"] = _penalty_per_late(ds)
        return cache["penalty_per_late"].get(client_id, 0.0)


# ---------------------------------------------------------------- replay
_lock = threading.Lock()
_cache: dict = {}  # "pop" -> population frame, (grace, hard_stop) -> result; for one dataset at a time
_owner: list = [None]


def clear_cache() -> None:
    with _lock:
        _cache.clear()
        _owner[0] = None


def _cache_for(ds) -> dict:
    """Called under _lock: drop everything when the dataset is rebuilt."""
    if _owner[0] is not ds:
        _cache.clear()
        _owner[0] = ds
    return _cache


def _population(ds) -> pd.DataFrame:
    """Historical same-day orders after 08:00, with the gain and SLA value of adding each to today's list."""
    df = ds.deliveries
    sel = df.same_day_after_cutoff.to_numpy()
    pop = df.loc[sel, ["delivery_id", "client_id", "order_received_ts", "fulfilment_warehouse_id",
                       "address_status", "late"]].copy()
    clients = ds.clients.set_index("client_id")
    at_risk_ids = ds.at_risk_client_ids
    pop["at_risk"] = pop.client_id.isin(at_risk_ids)
    pop["tier"] = pop.client_id.map(clients.account_tier)
    pop["priority"] = pop.at_risk | (pop.tier == "Tier 1")
    pop["complete"] = pop.address_status != "incomplete"

    # Gain of adding an order to today's pick list: its cause combination without same_day_after_cutoff
    # (the What-if simulator's combo method).
    model = ds.combos
    keys = model.keys[sel]
    gain_by_key = {k: model.rate_after(k, SAME_DAY_BIT) - model.rate[k] for k in np.unique(keys).tolist()}
    pop["gain"] = [gain_by_key[k] for k in keys.tolist()]
    pop["penalty_value"] = pop.client_id.map(_penalty_per_late(ds)).fillna(0.0).astype(float)
    pop["date"] = pop.order_received_ts.dt.date
    pop["minutes"] = pop.order_received_ts.dt.hour * 60 + pop.order_received_ts.dt.minute
    return pop.reset_index(drop=True)


def _pop_for(ds) -> pd.DataFrame:
    with _lock:
        cache = _cache_for(ds)
        if "pop" not in cache:
            cache["pop"] = _population(ds)
        return cache["pop"]


def _added(pop: pd.DataFrame, mask: np.ndarray, per_warehouse_day: float) -> dict:
    gain = pop.gain.to_numpy() * mask
    return {
        "orders": int(mask.sum()),
        "extra_orders_per_warehouse_day": round(int(mask.sum()) / per_warehouse_day, 2),
        "late_avoided_per_year": round(float(gain.sum()) * ANNUALISE, 1),
        "sla_penalties_avoided_usd_per_year": round(float((gain * pop.penalty_value.to_numpy()).sum()) * ANNUALISE),
        "at_risk_late_avoided_per_year": round(float(gain[pop.at_risk.to_numpy()].sum()) * ANNUALISE, 1),
    }


def _simulate(ds, grace_until: str, hard_stop: str) -> dict:
    pop = _pop_for(ds)
    m = pop.minutes.to_numpy()
    complete, priority = pop.complete.to_numpy(), pop.priority.to_numpy()
    in_grace = m < minutes_of(grace_until)
    in_urgent = ~in_grace & (m < minutes_of(hard_stop))
    days, warehouses = pop.date.nunique(), pop.fulfilment_warehouse_id.nunique()
    wd = days * warehouses
    grace = _added(pop, in_grace & complete, wd)
    urgent_priority = _added(pop, in_urgent & complete & priority, wd)
    today_on_time = 1 - float(pop.late.mean())
    gain = pop.gain.to_numpy()
    on_time_grace = today_on_time + float(gain[in_grace & complete].sum()) / len(pop)
    on_time_most = on_time_grace + float(gain[in_urgent & complete & priority].sum()) / len(pop)

    arrivals = []
    for start in range(PICK_LIST_CUTOFF_MINUTES, minutes_of(LATEST_TIME), TIME_STEP_MINUTES):
        n = int(((m >= start) & (m < start + TIME_STEP_MINUTES)).sum())
        arrivals.append({"from": hhmm(start), "to": hhmm(start + TIME_STEP_MINUTES), "orders": n,
                         "window": window_of(start, grace_until, hard_stop)})

    return {
        "inputs": {"pick_list_cutoff": PICK_LIST_CUTOFF, "grace_until": grace_until, "hard_stop": hard_stop},
        "population": {
            "after_cutoff_same_day": len(pop), "days": int(days), "warehouses": int(warehouses),
            "on_time_rate_today": round(today_on_time, 4),
            "grace_orders": int(in_grace.sum()), "urgent_window_orders": int(in_urgent.sum()),
            "urgent_window_priority_client_orders": int((in_urgent & priority).sum()),
            "after_hard_stop_orders": int((~in_grace & ~in_urgent).sum()),
            "incomplete_address_excluded": int(((in_grace | in_urgent) & ~complete).sum()),
        },
        "grace": grace,
        "urgent_priority_clients_at_most": urgent_priority,
        "urgent_other_clients_with_valid_reason": int((in_urgent & complete & ~priority).sum()),
        "on_time_rate_after_cutoff_orders": {"today": round(today_on_time, 4), "with_grace": round(on_time_grace, 4),
                                             "with_grace_and_urgent_at_most": round(on_time_most, 4)},
        "arrivals": arrivals,
        "rules": decision_rules(grace_until, hard_stop),
        "method": (f"Replay of the {len(pop):,} same-day orders received after the 08:00 pick-list cutoff. An order "
                   "added to today's pick list loses the same-day-after-cutoff cause and takes the observed on-time "
                   "rate of deliveries with its remaining causes (the What-if simulator's combo method). SLA money "
                   "= that gain x the client's expected SLA penalty per late delivery (its penalties / its late "
                   "deliveries). Orders with an incomplete address are on hold and never added. Yearly = six months "
                   "of data x2."),
        "assumptions": [
            "The grace period figures are exact for the history: every complete same-day order in it is added.",
            "History has no email text, so the urgent window is an upper bound: it counts priority-client orders "
            "as if every one said it was urgent. Other clients' orders need a valid reason, which history cannot "
            "show, so they are counted but not added.",
            "Added orders ship the same day like the 08:00 pick list; the warehouse adds them to today's list.",
            "Order counts are for the six months of data; money and late deliveries avoided are per year.",
        ],
    }


def simulate_late_orders(ds, grace_until: str = DEFAULT_GRACE_UNTIL, hard_stop: str = DEFAULT_HARD_STOP) -> dict:
    check_times(grace_until, hard_stop)
    key = (grace_until, hard_stop)
    with _lock:
        hit = _cache_for(ds).get(key)
    if hit is None:
        hit = _simulate(ds, *key)
        with _lock:
            _cache_for(ds)[key] = hit
    return deepcopy(hit)
