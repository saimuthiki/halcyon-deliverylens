"""Find out why Halcyon's deliveries are late.

Reads the hackathon dataset, tags each delivery with the five problems we found,
and works out how many on-time points each problem costs.

Run:  python analysis/root_cause_analysis.py
Writes: analysis/output/findings.json and a few CSV tables next to it.
Needs only pandas.
"""
import itertools
import json
import math
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "halcyon-dataset"
OUT = ROOT / "analysis" / "output"

PICK_LIST_CUTOFF_MINUTES = 8 * 60  # every warehouse compiles the pick list at 08:00
ROUTE_DEVIATION_LIMIT = 0.20       # driven more than 20% beyond the planned route

# Carrier + destination pairs whose on-time rate is far below the other carriers in that region.
WEAK_CARRIER_LANES = {("D", "Midwest"), ("D", "Southeast"), ("E", "West"),
                      ("F", "Northeast"), ("F", "Southeast")}

CAUSES = {
    "incomplete_address": "Address incomplete when the order came in",
    "same_day_after_cutoff": "Same-day order received after the 08:00 pick-list cutoff",
    "stock_not_at_nearest": "Nearest warehouse had no stock, shipped from further away",
    "weak_carrier_lane": "Carrier is weak in that destination region",
    "route_deviation": "Driver went more than 20% beyond the planned route",
}


def load():
    df = pd.read_csv(DATA / "deliveries.csv", parse_dates=["order_received_ts", "shipped_ts"])
    df["late"] = df["on_time"] == "N"
    minutes = df.order_received_ts.dt.hour * 60 + df.order_received_ts.dt.minute
    df["incomplete_address"] = df.address_status == "incomplete"
    df["same_day_after_cutoff"] = (df.commitment_type == "same_day") & (minutes >= PICK_LIST_CUTOFF_MINUTES)
    df["stock_not_at_nearest"] = df.nearest_warehouse_had_stock == "N"
    df["weak_carrier_lane"] = [(c, r) in WEAK_CARRIER_LANES for c, r in zip(df.carrier_id, df.destination_region)]
    deviation = df.actual_route_km / df.planned_route_km - 1
    df["route_deviation"] = (deviation > ROUTE_DEVIATION_LIMIT).fillna(False)
    return df


def on_time_if_fixed(df, fixed):
    """On-time rate if the causes in `fixed` were removed.

    Each delivery takes the on-time rate of deliveries that have the same remaining causes.
    """
    causes = list(CAUSES)
    combo = df[causes].astype(int).astype(str).agg("".join, axis=1)
    rate = df.groupby(combo).late.apply(lambda s: 1 - s.mean()).to_dict()
    counts = combo.value_counts().to_dict()
    total = 0.0
    for key, n in counts.items():
        new_key = "".join("0" if causes[i] in fixed else ch for i, ch in enumerate(key))
        total += n * rate.get(new_key, rate[key])
    return total / len(df)


def fair_share(df):
    """Shapley split: each cause's average on-time gain over every order of fixing."""
    causes = list(CAUSES)
    cache = {}

    def value(subset):
        key = frozenset(subset)
        if key not in cache:
            cache[key] = on_time_if_fixed(df, key)
        return cache[key]

    n = len(causes)
    shares = {}
    for cause in causes:
        others = [c for c in causes if c != cause]
        gain = 0.0
        for r in range(n):
            for subset in itertools.combinations(others, r):
                weight = math.factorial(r) * math.factorial(n - r - 1) / math.factorial(n)
                gain += weight * (value(set(subset) | {cause}) - value(set(subset)))
        shares[cause] = gain
    return shares


def holdout_check(df):
    """Pick weak carrier lanes from Apr-Jun only, then test them and the five causes on Jul-Sep.

    A lane is "weak" if its on-time rate is more than 10 points below its region's average.
    """
    train = df[df.order_received_ts < "2026-07-01"]
    test = df[df.order_received_ts >= "2026-07-01"]
    lane_rate = train.groupby(["carrier_id", "destination_region"]).late.apply(lambda s: 1 - s.mean())
    region_rate = train.groupby("destination_region").late.apply(lambda s: 1 - s.mean())
    picked = sorted(k for k, v in lane_rate.items() if v < region_rate[k[1]] - 0.10)
    weak = pd.Series([(c, r) in set(picked) for c, r in zip(test.carrier_id, test.destination_region)], index=test.index)
    other = test[list(CAUSES)].drop(columns="weak_carrier_lane").any(axis=1)
    clean = ~(other | weak)
    return {
        "lanes_picked_from_apr_jun": [f"{c}-{r}" for c, r in picked],
        "same_as_full_data_lanes": set(picked) == WEAK_CARRIER_LANES,
        "jul_sep_on_time_weak_lanes": round(1 - test[weak].late.mean(), 4),
        "jul_sep_on_time_other_lanes": round(1 - test[~weak].late.mean(), 4),
        "jul_sep_on_time_with_no_problem": round(1 - test[clean].late.mean(), 4),
    }


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    df = load()
    clients = pd.read_csv(DATA / "clients.csv")
    penalties = pd.read_csv(DATA / "sla_penalties.csv")
    complaints = pd.read_csv(DATA / "complaints.csv")
    time_study = pd.read_csv(DATA / "customer_success_time_study.csv")

    base = 1 - df.late.mean()
    clean = df[~df[list(CAUSES)].any(axis=1)]
    shares = fair_share(df)
    routing = {"weak_carrier_lane", "route_deviation"}
    process = {"incomplete_address", "same_day_after_cutoff", "stock_not_at_nearest"}

    per_cause = []
    for cause, label in CAUSES.items():
        flagged = df[df[cause]]
        per_cause.append({
            "cause": cause,
            "label": label,
            "deliveries": int(len(flagged)),
            "on_time_rate": round(1 - flagged.late.mean(), 4),
            "share_of_late_deliveries": round(flagged.late.sum() / df.late.sum(), 4),
            "points_gained_if_fixed_alone": round((on_time_if_fixed(df, {cause}) - base) * 100, 1),
            "fair_share_points": round(shares[cause] * 100, 1),
            "sla_penalties_usd": int(penalties.merge(flagged[["delivery_id"]]).penalty_usd.sum()),
        })

    at_risk = clients[clients.account_status == "threatening_to_leave"]
    at_risk_deliveries = df[df.client_id.isin(at_risk.client_id)]
    findings = {
        "deliveries": int(len(df)),
        "period": [str(df.order_received_ts.min().date()), str(df.order_received_ts.max().date())],
        "on_time_rate_today": round(base, 4),
        "on_time_rate_with_no_problem": round(1 - clean.late.mean(), 4),
        "deliveries_with_no_problem": int(len(clean)),
        "on_time_if_all_fixed": round(on_time_if_fixed(df, set(CAUSES)), 4),
        "on_time_if_only_routing_fixed": round(on_time_if_fixed(df, routing), 4),
        "on_time_if_only_process_fixed": round(on_time_if_fixed(df, process), 4),
        "causes": per_cause,
        "money": {
            "sla_penalties_6_months_usd": int(penalties.penalty_usd.sum()),
            "redelivery_cost_6_months_usd": int(df.redelivery_cost_usd.sum()),
            "at_risk_clients": int(len(at_risk)),
            "at_risk_annual_revenue_usd": int(at_risk.annual_revenue_usd.sum()),
            "at_risk_on_time_rate": round(1 - at_risk_deliveries.late.mean(), 4),
            "routing_vendor_budget_usd": 680000,
        },
        "complaints": {
            "total": int(len(complaints)),
            "by_category": complaints.category.value_counts().to_dict(),
            "from_at_risk_clients": int(complaints.client_id.isin(at_risk.client_id).sum()),
        },
        "customer_success_week": {
            "hours_total": float(time_study.hours_total.sum()),
            "hours_on_complaints": round(float(time_study.hours_on_delivery_complaints.sum()), 1),
            "hours_keying_email_orders": round(float(time_study.hours_keying_email_orders.sum()), 1),
            "hours_proactive": round(float(time_study.hours_on_proactive_client_work.sum()), 1),
        },
        "data_quality": {
            "missing_actual_route_km": int(df.actual_route_km.isna().sum()),
            "duplicate_order_ids": int(df.order_id.duplicated().sum()),
            "late_deliveries_with_redelivery_cost": int(((df.redelivery_cost_usd > 0) & df.late).sum()),
            "late_deliveries": int(df.late.sum()),
        },
    }
    findings["holdout_check"] = holdout_check(df)
    (OUT / "findings.json").write_text(json.dumps(findings, indent=2))

    df.pivot_table(index="destination_region", columns="carrier_id", values="late",
                   aggfunc=lambda s: round(1 - s.mean(), 3)).to_csv(OUT / "on_time_by_carrier_and_region.csv")
    df.assign(hour=df.order_received_ts.dt.hour).groupby(["commitment_type", "hour"]).late.agg(
        deliveries="size", on_time_rate=lambda s: round(1 - s.mean(), 3)).to_csv(OUT / "on_time_by_order_hour.csv")
    df.groupby("order_channel").agg(deliveries=("late", "size"),
                                    incomplete_address_rate=("incomplete_address", "mean"),
                                    on_time_rate=("late", lambda s: 1 - s.mean())).round(3).to_csv(
        OUT / "channel_summary.csv")
    print(json.dumps(findings, indent=2))


if __name__ == "__main__":
    main()
