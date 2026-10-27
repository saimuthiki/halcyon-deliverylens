"""Morning risk board: at 08:00, score every shipment on the day's pick list for the risk of arriving late.

Only what is known before the goods ship is used: the address status, a same-day order after the cutoff, stock
not at the nearest warehouse, a weak carrier lane, and the delivery promise. Route deviation happens on the road,
so it is not an input.

Risk = the share of past deliveries with the same combination that arrived late. "Past" means delivered before
that morning, so a day is scored only with what was known then. Combinations seen fewer than MIN_SAMPLE times
fall back to the same causes without the promise type, then to the overall late rate.

Each risky shipment gets the fixes that can still be made that morning, and the risk after them:
- incomplete address: confirm it with the client before the carrier collects;
- weak carrier lane: book the best on-time carrier for that region instead.
Stock in the wrong warehouse and a same-day order that already missed the list cannot be fixed that morning;
the board says so and suggests telling the client early.

No AI decides anything here: the score is a lookup over history. The Morning Note Agent only words a summary.
"""
import threading

import numpy as np
import pandas as pd

from app.analytics.late_orders import expected_penalty_per_late

PRE_SHIP = ["incomplete_address", "same_day_after_cutoff", "stock_not_at_nearest", "weak_carrier_lane"]
FIXABLE = ["incomplete_address", "weak_carrier_lane"]
MIN_SAMPLE = 30
MIN_SHIPMENTS = 150  # days with fewer shipments (start and end of the data) are not offered
BACKTEST_SPLIT = "2026-08-01"
TOP = 20
LABELS = {"incomplete_address": "Incomplete address", "same_day_after_cutoff": "Same-day order after 08:00",
          "stock_not_at_nearest": "Stock not at the nearest warehouse", "weak_carrier_lane": "Weak carrier lane"}

_lock = threading.Lock()
_cache: dict = {}


class UnknownDay(ValueError):
    pass


def _bits(df: pd.DataFrame) -> np.ndarray:
    key = np.zeros(len(df), dtype=np.int64)
    for i, c in enumerate(PRE_SHIP):
        key |= df[c].to_numpy().astype(np.int64) << i
    return key


class RiskModel:
    """Late rates by pre-ship cause combination (and promise type), learned from `history`."""

    def __init__(self, history: pd.DataFrame):
        bits = _bits(history)
        late = history.late.to_numpy()
        g1 = pd.DataFrame({"b": bits, "t": history.commitment_type.to_numpy(), "late": late}).groupby(["b", "t"]).late
        g2 = pd.DataFrame({"b": bits, "late": late}).groupby("b").late
        self.fine = {k: (float(m), int(n)) for k, m, n in zip(g1.mean().index, g1.mean().values, g1.size().values)}
        self.coarse = {int(k): (float(m), int(n)) for k, m, n in zip(g2.mean().index, g2.mean().values, g2.size().values)}
        self.base = float(late.mean())
        lanes = history.groupby(["destination_region", "carrier_id"]).late.agg(["mean", "size"])
        lanes = lanes[lanes["size"] >= MIN_SAMPLE]
        self.best_carrier = {}
        for region, g in lanes.groupby(level=0):
            row = g["mean"].idxmin()
            self.best_carrier[region] = (row[1], round(1 - float(g["mean"].min()), 3))

    def rate(self, bits: int, commitment: str) -> float:
        m, n = self.fine.get((bits, commitment), (None, 0))
        if n >= MIN_SAMPLE:
            return m
        m, n = self.coarse.get(bits, (None, 0))
        return m if n >= MIN_SAMPLE else self.base


def _model_for(ds, day: pd.Timestamp) -> RiskModel:
    key = ("model", id(ds), day)
    with _lock:
        if key not in _cache:
            df = ds.deliveries
            _cache[key] = RiskModel(df[df.delivered_date < day])
        return _cache[key]


def available_days(ds) -> list[str]:
    counts = ds.deliveries.groupby("pick_list_date").size()
    days = counts[counts >= MIN_SHIPMENTS].index
    first = ds.deliveries.delivered_date.min() + pd.Timedelta(days=28)  # a month of history before the first board
    return [d.date().isoformat() for d in sorted(days) if d >= first]


def _fixes(r, bits: int, model: RiskModel, risk: float) -> tuple[list[dict], float]:
    out, cleared = [], 0
    for i, c in enumerate(PRE_SHIP):
        if not bits >> i & 1:
            continue
        if c == "incomplete_address":
            after = min(risk, model.rate(bits & ~(1 << i), r.commitment_type))
            out.append({"cause": c, "action": "Confirm the address with the client before the carrier collects at 14:00.",
                        "owner": "Customer Success", "risk_after": round(after, 3)})
            cleared |= 1 << i
        elif c == "weak_carrier_lane":
            best, rate = model.best_carrier.get(r.destination_region, (None, None))
            if best and best != r.carrier_id:
                after = min(risk, model.rate(bits & ~(1 << i), r.commitment_type))
                out.append({"cause": c, "action": f"Book carrier {best} instead of {r.carrier_id} "
                                                  f"({rate:.0%} on time to the {r.destination_region}).",
                            "owner": "Carrier manager", "risk_after": round(after, 3), "carrier": best})
                cleared |= 1 << i
        elif c == "stock_not_at_nearest":
            out.append({"cause": c, "action": f"No fix this morning: it ships from {r.fulfilment_warehouse_id}, "
                                              f"{int(r.distance_miles)} miles away. Tell the client the likely date now.",
                        "owner": "Customer Success", "risk_after": None})
        elif c == "same_day_after_cutoff":
            out.append({"cause": c, "action": "Already missed the same-day list: tell the client the new date now.",
                        "owner": "Customer Success", "risk_after": None})
    # Never show a fix as raising the risk (a rarer combination can have a noisier rate).
    after_all = min(risk, model.rate(bits & ~cleared, r.commitment_type)) if cleared else risk
    return out, round(after_all, 3)


def risk_board(ds, day: str | None = None, warehouse: str | None = None, limit: int = TOP, sort: str = "risk") -> dict:
    days = available_days(ds)
    day = day or days[-1]
    if day not in days:
        raise UnknownDay(day)
    ts = pd.Timestamp(day)
    model = _model_for(ds, ts)
    df = ds.deliveries
    todays = df[df.pick_list_date == ts]
    if warehouse:
        todays = todays[todays.fulfilment_warehouse_id == warehouse]
    bits = _bits(todays)
    at_risk = ds.at_risk_client_ids
    late_hist = df[(df.delivered_date < ts) & df.late]
    redelivery_per_late = float(late_hist.redelivery_cost_usd.mean()) if len(late_hist) else 0.0
    penalty = {}
    rows = []
    for r, b in zip(todays.itertuples(), bits):
        risk = model.rate(int(b), r.commitment_type)
        if r.client_id not in penalty:
            penalty[r.client_id] = expected_penalty_per_late(ds, r.client_id)
        fixes, after = _fixes(r, int(b), model, risk) if b else ([], round(risk, 3))
        rows.append({
            "delivery_id": r.delivery_id, "client_id": r.client_id, "at_risk_client": r.client_id in at_risk,
            "commitment_type": r.commitment_type, "region": r.destination_region, "carrier_id": r.carrier_id,
            "warehouse_id": r.fulfilment_warehouse_id, "nearest_warehouse_id": r.nearest_warehouse_id,
            "causes": [c for i, c in enumerate(PRE_SHIP) if b >> i & 1],
            "risk": round(risk, 3), "risk_after_fixes": after,
            "money_at_risk_usd": round(risk * (penalty[r.client_id] + redelivery_per_late)),
            "fixes": fixes,
            # Known only after delivery; the UI hides it unless "what really happened" is switched on.
            "hindsight": {"late": bool(r.late), "days_late": int(r.days_late)},
        })
    key = (lambda x: (-x["money_at_risk_usd"], -x["risk"])) if sort == "money" else (lambda x: (-x["risk"], -x["money_at_risk_usd"]))
    rows.sort(key=key)
    top = rows[:limit]
    fixable = [x for x in rows if x["risk_after_fixes"] < x["risk"]]
    expected = sum(x["risk"] for x in rows)
    expected_after = sum(min(x["risk"], x["risk_after_fixes"]) for x in rows)
    return {
        "day": day, "days": days, "warehouse": warehouse, "sort": sort,
        "shipments": len(rows), "expected_late": round(expected, 1),
        "expected_late_after_fixes": round(expected_after, 1),
        "fixable_shipments": len(fixable),
        "by_warehouse": {w: int(n) for w, n in todays.fulfilment_warehouse_id.value_counts().sort_index().items()},
        "history": {"deliveries": int((df.delivered_date < ts).sum()), "late_rate": round(model.base, 3),
                    "through": (ts - pd.Timedelta(days=1)).date().isoformat()},
        "top": top,
        "hindsight": {"late_in_top": sum(x["hindsight"]["late"] for x in top), "top": len(top),
                      "late_all": sum(x["hindsight"]["late"] for x in rows)},
        "method": ("Risk = share of past deliveries with the same pre-ship causes and promise that arrived late, using "
                   "only deliveries delivered before this morning. Money at risk = risk x (the client's expected SLA "
                   "penalty per late delivery + the average redelivery cost). No AI in the score."),
    }


def backtest(ds) -> dict:
    """Learn from deliveries before BACKTEST_SPLIT, score the rest, and check against what happened."""
    key = ("backtest", id(ds))
    with _lock:
        if key in _cache:
            return _cache[key]
    df = ds.deliveries
    split = pd.Timestamp(BACKTEST_SPLIT)
    model = RiskModel(df[df.delivered_date < split])
    test = df[df.pick_list_date >= split]
    bits = _bits(test)
    risk = np.array([model.rate(int(b), t) for b, t in zip(bits, test.commitment_type)])
    late = test.late.to_numpy()
    ranks = pd.Series(risk).rank().to_numpy()
    n1, n0 = late.sum(), len(late) - late.sum()
    auc = (ranks[late].sum() - n1 * (n1 + 1) / 2) / (n1 * n0)
    t = test.assign(risk=risk).sort_values("risk", ascending=False)
    top = t.groupby("pick_list_date").head(TOP)
    out = {"trained_on": f"deliveries delivered before {BACKTEST_SPLIT}", "tested_on": f"pick lists from {BACKTEST_SPLIT}",
           "test_shipments": int(len(test)), "test_days": int(test.pick_list_date.nunique()),
           "late_rate": round(float(late.mean()), 3), "auc": round(float(auc), 3),
           "top_per_day": TOP, "top_precision": round(float(top.late.mean()), 3),
           "meaning": (f"Of the {TOP} riskiest shipments each morning, {top.late.mean():.0%} were really late, against "
                       f"{late.mean():.0%} of all shipments. The score ranks a late shipment above an on-time one "
                       f"{auc:.0%} of the time.")}
    with _lock:
        _cache[key] = out
    return out


def clear_cache() -> None:
    with _lock:
        _cache.clear()
