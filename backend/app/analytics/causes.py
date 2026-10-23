"""Tag each delivery with the five causes found in analysis/root_cause_analysis.py.

Copied verbatim from the analysis so the numbers stay identical to findings.json.
"""
import pandas as pd

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

ROUTING_CAUSES = frozenset({"weak_carrier_lane", "route_deviation"})
PROCESS_CAUSES = frozenset({"incomplete_address", "same_day_after_cutoff", "stock_not_at_nearest"})


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
