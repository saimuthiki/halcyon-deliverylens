"""Tag each delivery with the five causes found in analysis/root_cause_analysis.py.

Copied verbatim from the analysis so the numbers stay identical to findings.json.
"""
import pandas as pd

PICK_LIST_CUTOFF_MINUTES = 8 * 60  # every warehouse compiles the pick list at 08:00
ROUTE_DEVIATION_LIMIT = 0.20       # driven more than 20% beyond the planned route

# Carrier + destination pairs that are weak once the other causes are taken out: lane on-time, among
# deliveries with no other cause, 10+ points below the region's median carrier (analysis weak_lanes()).
WEAK_CARRIER_LANES = {("D", "Midwest"), ("D", "Northeast"), ("D", "Southeast"), ("D", "West"),
                      ("E", "West"), ("F", "Northeast"), ("F", "Southeast")}

CAUSES = {
    "incomplete_address": "Address incomplete when the order came in",
    "same_day_after_cutoff": "Same-day order received after the 08:00 pick-list cutoff",
    "stock_not_at_nearest": "Nearest warehouse had no stock, shipped from further away",
    "weak_carrier_lane": "Weak carrier on that lane (D everywhere, E to West, F to Northeast/Southeast)",
    "route_deviation": "Driver went more than 20% beyond the planned route",
}

ROUTING_CAUSES = frozenset({"weak_carrier_lane", "route_deviation"})
PROCESS_CAUSES = frozenset({"incomplete_address", "same_day_after_cutoff", "stock_not_at_nearest"})

# Realistic case: share of each cause we expect a fix to remove (our assumptions, as in the analysis).
REALISTIC_EFFECTIVENESS = {
    "incomplete_address": 0.80,     # intake agent catches most gaps; some clients reply late
    "same_day_after_cutoff": 0.70,  # second pick wave or honest next-day promise for most
    "stock_not_at_nearest": 0.50,   # monthly instead of quarterly rebalancing
    "weak_carrier_lane": 0.90,      # reassign the 7 lanes; some capacity limits remain
    "route_deviation": 0.50,        # route discipline / small routing pilot
}

# Yearly cost of each fix: our estimates, to be confirmed with Halcyon. The carrier cost is computed
# from the rate card (see roi.carrier_switch_cost).
FIX_COST_USD_PER_YEAR = {
    "incomplete_address": 60_000,     # build + run the intake agent (Bedrock usage, support)
    "same_day_after_cutoff": 65_000,  # second pick wave: ~2 extra hours/day at 5 warehouses
    "stock_not_at_nearest": 50_000,   # extra inter-warehouse transfers
    "weak_carrier_lane": None,        # pricier carriers on the 7 weak lanes
    "route_deviation": 100_000,       # small routing pilot on high-deviation lanes
}
VENDOR_BUDGET_USD = 680_000


def tag_causes(df: pd.DataFrame) -> pd.DataFrame:
    """Add `late` and one boolean column per cause. Expects parsed timestamps."""
    df = df.copy()
    df["late"] = df["on_time"] == "N"
    minutes = df.order_received_ts.dt.hour * 60 + df.order_received_ts.dt.minute
    df["incomplete_address"] = df.address_status == "incomplete"
    df["same_day_after_cutoff"] = (df.commitment_type == "same_day") & (minutes >= PICK_LIST_CUTOFF_MINUTES)
    df["stock_not_at_nearest"] = df.nearest_warehouse_had_stock == "N"
    df["weak_carrier_lane"] = [(c, r) in WEAK_CARRIER_LANES for c, r in zip(df.carrier_id, df.destination_region)]
    deviation = df.actual_route_km / df.planned_route_km - 1
    df["route_deviation"] = (deviation > ROUTE_DEVIATION_LIMIT).fillna(False).astype(bool)
    return df


def causes_of(row) -> list[str]:
    return [c for c in CAUSES if bool(row[c])]
