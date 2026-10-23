"""Find out why Halcyon's deliveries are late, and what fixing each cause is worth.

Reads the hackathon dataset, tags each delivery with the five causes we found, and works out:
- how many on-time points each cause costs (fair-share / Shapley split),
- the ceiling if every cause were removed, and a realistic case with partial fixes,
- what each option saves per year, and a simple cost / payback view (assumptions stated below),
- an out-of-time check: rules picked on Apr-Jun only, tested on Jul-Sep.

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
WEAK_LANE_GAP = 0.10               # a lane is weak if 10+ points below the region's median carrier

# Carrier + destination pairs that are weak once the other causes are taken out.
# Derived by weak_lanes() below; the out-of-time check re-derives them from Apr-Jun only.
WEAK_CARRIER_LANES = {("D", "Midwest"), ("D", "Northeast"), ("D", "Southeast"), ("D", "West"),
                      ("E", "West"), ("F", "Northeast"), ("F", "Southeast")}

CAUSES = {
    "incomplete_address": "Address incomplete when the order came in",
    "same_day_after_cutoff": "Same-day order received after the 08:00 pick-list cutoff",
    "stock_not_at_nearest": "Nearest warehouse had no stock, shipped from further away",
    "weak_carrier_lane": "Weak carrier on that lane (D everywhere, E to West, F to Northeast/Southeast)",
    "route_deviation": "Driver went more than 20% beyond the planned route",
}
ROUTING = {"weak_carrier_lane", "route_deviation"}
PROCESS = {"incomplete_address", "same_day_after_cutoff", "stock_not_at_nearest"}

# Realistic case: share of each cause we expect a fix to remove. These are our assumptions,
# stated so the client can challenge them; the ceiling (all 1.0) is shown alongside.
REALISTIC_EFFECTIVENESS = {
    "incomplete_address": 0.80,     # intake agent catches most gaps; some clients reply late
    "same_day_after_cutoff": 0.70,  # second pick wave or honest next-day promise for most
    "stock_not_at_nearest": 0.50,   # monthly instead of quarterly rebalancing
    "weak_carrier_lane": 0.90,      # reassign the 7 lanes; some capacity limits remain
    "route_deviation": 0.50,        # route discipline / small routing pilot
}

# Yearly cost of each fix: our estimates, to be confirmed with Halcyon (marked [EST] in docs).
FIX_COST_USD_PER_YEAR = {
    "incomplete_address": 60_000,     # build + run the intake agent (Bedrock usage, support)
    "same_day_after_cutoff": 65_000,  # second pick wave: ~2 extra hours/day at 5 warehouses
    "stock_not_at_nearest": 50_000,   # extra inter-warehouse transfers
    "weak_carrier_lane": None,        # computed from the rate card: pricier carriers on 7 lanes
    "route_deviation": 100_000,       # small routing pilot on high-deviation lanes
}
VENDOR_BUDGET_USD = 680_000


def tag(df):
    df = df.copy()
    df["late"] = df["on_time"] == "N"
    minutes = df.order_received_ts.dt.hour * 60 + df.order_received_ts.dt.minute
    df["incomplete_address"] = df.address_status == "incomplete"
    df["same_day_after_cutoff"] = (df.commitment_type == "same_day") & (minutes >= PICK_LIST_CUTOFF_MINUTES)
    df["stock_not_at_nearest"] = df.nearest_warehouse_had_stock == "N"
    df["weak_carrier_lane"] = [(c, r) in WEAK_CARRIER_LANES for c, r in zip(df.carrier_id, df.destination_region)]
    deviation = df.actual_route_km / df.planned_route_km - 1
    df["route_deviation"] = (deviation > ROUTE_DEVIATION_LIMIT).fillna(False)
    return df


def load():
    return tag(pd.read_csv(DATA / "deliveries.csv", parse_dates=["order_received_ts", "shipped_ts"]))


def weak_lanes(df):
    """Lanes 10+ points below the region's median carrier, measured on deliveries with no other cause."""
    other = df[[c for c in CAUSES if c != "weak_carrier_lane"]].any(axis=1)
    clean = df[~other]
    rate = clean.groupby(["carrier_id", "destination_region"]).late.apply(lambda s: 1 - s.mean())
    median = rate.groupby(level=1).median()
    return {k for k, v in rate.items() if v < median[k[1]] - WEAK_LANE_GAP}


def combo_keys(df):
    return df[list(CAUSES)].astype(int).astype(str).agg("".join, axis=1)


def expected_on_time(df, effectiveness):
    """Expected on-time rate if each cause is removed from a share of the deliveries that have it.

    `effectiveness` maps cause -> share removed (0..1). For a delivery with causes S, each cause is
    removed independently with its probability, and the delivery takes the observed on-time rate of
    deliveries with the causes that remain. With every share at 1.0 this is the ceiling.
    """
    causes = list(CAUSES)
    keys = combo_keys(df)
    rate = df.groupby(keys).late.apply(lambda s: 1 - s.mean()).to_dict()
    total = 0.0
    for key, n in keys.value_counts().items():
        present = [i for i, ch in enumerate(key) if ch == "1"]
        value = 0.0
        for r in range(len(present) + 1):
            for removed in itertools.combinations(present, r):
                p = 1.0
                for i in present:
                    e = effectiveness.get(causes[i], 0.0)
                    p *= e if i in removed else (1 - e)
                if p == 0:
                    continue
                new_key = "".join("0" if i in removed else ch for i, ch in enumerate(key))
                value += p * rate.get(new_key, rate[key])
        total += n * value
    return total / len(df)


def fixed(causes_fixed):
    return {c: (1.0 if c in causes_fixed else 0.0) for c in CAUSES}


def fair_share(df):
    """Shapley split: each cause's average on-time gain over every order of fixing."""
    causes = list(CAUSES)
    cache = {}

    def value(subset):
        key = frozenset(subset)
        if key not in cache:
            cache[key] = expected_on_time(df, fixed(key))
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


def yearly_savings(df, effectiveness, penalties):
    """Penalties and redelivery costs avoided per year (six months of data x2).

    A late delivery with causes S becomes on time with probability
    (expected rate after the fix - observed rate) / (1 - observed rate) for its cause group.
    """
    keys = combo_keys(df)
    causes = list(CAUSES)
    rate_d = df.groupby(keys).late.apply(lambda s: 1 - s.mean()).to_dict()
    flip = {}
    for key, base in rate_d.items():
        present = [i for i, ch in enumerate(key) if ch == "1"]
        value = 0.0
        for r in range(len(present) + 1):
            for removed in itertools.combinations(present, r):
                p = 1.0
                for i in present:
                    e = effectiveness.get(causes[i], 0.0)
                    p *= e if i in removed else (1 - e)
                new_key = "".join("0" if i in removed else ch for i, ch in enumerate(key))
                value += p * rate_d.get(new_key, base)
        flip[key] = 0.0 if base >= 1 else max(0.0, (value - base) / (1 - base))
    late = df[df.late].assign(key=keys[df.late])
    pen = late.merge(penalties[["delivery_id", "penalty_usd"]], on="delivery_id", how="left").fillna({"penalty_usd": 0})
    p_flip = pen.key.map(flip)
    return {
        "sla_penalties_avoided_usd": round(float((p_flip * pen.penalty_usd).sum()) * 2),
        "redelivery_avoided_usd": round(float((p_flip * pen.redelivery_cost_usd).sum()) * 2),
        "late_deliveries_avoided": round(float(p_flip.sum()) * 2),
    }


def carrier_switch_cost(df):
    """Extra yearly carrier spend if weak-lane shipments move to the other carriers' average rate."""
    weak = df[df.weak_carrier_lane]
    good_rate = df[~df.weak_carrier_lane].groupby("destination_region").carrier_rate_usd.mean()
    extra = (weak.destination_region.map(good_rate) - weak.carrier_rate_usd).clip(lower=0).sum()
    return round(float(extra) * 2)


def holdout_check(df):
    """Pick weak lanes from Apr-Jun only (same rule), then test lanes and causes on Jul-Sep."""
    train = df[df.order_received_ts < "2026-07-01"]
    test = df[df.order_received_ts >= "2026-07-01"]
    picked = weak_lanes(train)
    weak = pd.Series([(c, r) in picked for c, r in zip(test.carrier_id, test.destination_region)], index=test.index)
    other = test[[c for c in CAUSES if c != "weak_carrier_lane"]].any(axis=1)
    return {
        "lanes_picked_from_apr_jun": [f"{c}-{r}" for c, r in sorted(picked)],
        "same_as_full_data_lanes": picked == WEAK_CARRIER_LANES,
        "jul_sep_on_time_weak_lanes_no_other_cause": round(1 - test[weak & ~other].late.mean(), 4),
        "jul_sep_on_time_other_lanes_no_other_cause": round(1 - test[~weak & ~other].late.mean(), 4),
        "jul_sep_on_time_with_no_problem": round(1 - test[~(other | weak)].late.mean(), 4),
    }


def effectiveness_for_target(df, target=0.94):
    """Smallest equal effectiveness across all five fixes that reaches `target` on-time (2 decimals)."""
    lo, hi = 0.0, 1.0
    for _ in range(12):
        mid = (lo + hi) / 2
        if expected_on_time(df, {c: mid for c in CAUSES}) >= target:
            hi = mid
        else:
            lo = mid
    return round(hi, 2)


def scenario(df, name, effectiveness, penalties, cost_per_year):
    otd = expected_on_time(df, effectiveness)
    saving = yearly_savings(df, effectiveness, penalties)
    total_saving = saving["sla_penalties_avoided_usd"] + saving["redelivery_avoided_usd"]
    return {
        "name": name,
        "on_time_rate": round(otd, 4),
        "points_gained": round((otd - (1 - df.late.mean())) * 100, 1),
        **saving,
        "cost_per_year_usd": cost_per_year,
        "net_benefit_per_year_usd": total_saving - cost_per_year,
        "net_benefit_penalties_only_usd": saving["sla_penalties_avoided_usd"] - cost_per_year,
    }


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    df = load()
    assert weak_lanes(df) == WEAK_CARRIER_LANES, "weak lane rule no longer matches the constant"
    clients = pd.read_csv(DATA / "clients.csv")
    penalties = pd.read_csv(DATA / "sla_penalties.csv")
    complaints = pd.read_csv(DATA / "complaints.csv")
    time_study = pd.read_csv(DATA / "customer_success_time_study.csv")

    base = 1 - df.late.mean()
    clean = df[~df[list(CAUSES)].any(axis=1)]
    ceiling = expected_on_time(df, fixed(CAUSES))
    shares = fair_share(df)

    costs = dict(FIX_COST_USD_PER_YEAR, weak_carrier_lane=carrier_switch_cost(df))
    cost_of = lambda causes: sum(costs[c] for c in causes)  # noqa: E731
    realistic = {c: REALISTIC_EFFECTIVENESS[c] for c in CAUSES}
    scenarios = [
        scenario(df, "Routing vendor only (ceiling)", fixed(ROUTING), penalties, VENDOR_BUDGET_USD),
        scenario(df, "Process fixes only (ceiling)", fixed(PROCESS), penalties, cost_of(PROCESS)),
        scenario(df, "All five fixes, realistic", realistic, penalties, cost_of(CAUSES)),
        scenario(df, "All five fixes, ceiling", fixed(CAUSES), penalties, cost_of(CAUSES)),
    ]

    per_cause = []
    for cause, label in CAUSES.items():
        flagged = df[df[cause]]
        per_cause.append({
            "cause": cause,
            "label": label,
            "deliveries": int(len(flagged)),
            "on_time_rate": round(1 - flagged.late.mean(), 4),
            "share_of_late_deliveries": round(flagged.late.sum() / df.late.sum(), 4),
            "points_gained_if_fixed_alone": round((expected_on_time(df, fixed({cause})) - base) * 100, 1),
            "fair_share_points": round(shares[cause] * 100, 1),
            "realistic_effectiveness": REALISTIC_EFFECTIVENESS[cause],
            "fix_cost_per_year_usd": costs[cause],
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
        "on_time_if_all_fixed": round(ceiling, 4),
        "on_time_if_only_routing_fixed": round(expected_on_time(df, fixed(ROUTING)), 4),
        "on_time_if_only_process_fixed": round(expected_on_time(df, fixed(PROCESS)), 4),
        "on_time_realistic": round(expected_on_time(df, realistic), 4),
        "effectiveness_needed_for_94_benchmark": effectiveness_for_target(df),
        "points_lost_today": round((1 - base) * 100, 1),
        "points_explained_by_the_five_causes": round(sum(shares.values()) * 100, 1),
        "causes": per_cause,
        "scenarios": scenarios,
        "money": {
            "sla_penalties_6_months_usd": int(penalties.penalty_usd.sum()),
            "redelivery_cost_6_months_usd": int(df.redelivery_cost_usd.sum()),
            "at_risk_clients": int(len(at_risk)),
            "at_risk_annual_revenue_usd": int(at_risk.annual_revenue_usd.sum()),
            "at_risk_on_time_rate": round(1 - at_risk_deliveries.late.mean(), 4),
            "others_on_time_rate": round(1 - df[~df.client_id.isin(at_risk.client_id)].late.mean(), 4),
            "routing_vendor_budget_usd": VENDOR_BUDGET_USD,
            "fix_costs_are_estimates": True,
        },
        "complaints": {
            "total": int(len(complaints)),
            "by_category": complaints.category.value_counts().to_dict(),
            "from_at_risk_clients": int(complaints.client_id.isin(at_risk.client_id).sum()),
            "not_told_about_delay": int((complaints.category == "Not told about the delay").sum()),
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
        "holdout_check": holdout_check(df),
    }
    (OUT / "findings.json").write_text(json.dumps(findings, indent=2))

    df.pivot_table(index="destination_region", columns="carrier_id", values="late",
                   aggfunc=lambda s: round(1 - s.mean(), 3)).to_csv(OUT / "on_time_by_carrier_and_region.csv")
    other = df[[c for c in CAUSES if c != "weak_carrier_lane"]].any(axis=1)
    df[~other].pivot_table(index="destination_region", columns="carrier_id", values="late",
                           aggfunc=lambda s: round(1 - s.mean(), 3)).to_csv(
        OUT / "on_time_by_carrier_and_region_no_other_cause.csv")
    df.assign(hour=df.order_received_ts.dt.hour).groupby(["commitment_type", "hour"]).late.agg(
        deliveries="size", on_time_rate=lambda s: round(1 - s.mean(), 3)).to_csv(OUT / "on_time_by_order_hour.csv")
    df.groupby("order_channel").agg(deliveries=("late", "size"),
                                    incomplete_address_rate=("incomplete_address", "mean"),
                                    on_time_rate=("late", lambda s: 1 - s.mean())).round(3).to_csv(
        OUT / "channel_summary.csv")
    print(json.dumps(findings, indent=2))


if __name__ == "__main__":
    main()
