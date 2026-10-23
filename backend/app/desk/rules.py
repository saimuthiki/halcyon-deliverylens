"""Deterministic rules and data lookups behind the Order desk. No AI here: numbers and rules stay fixed.

- destination region from the ship-to state (a simple state -> region map for the four regions)
- warehouses by distance from warehouse_region_distance_miles.csv
- simulated stock (deterministic hash, about 12% out of stock, like the 12% in the data)
- promise and pick-list dates with the 08:00 cutoff, using the same offsets as the dataset
- carrier: the old spreadsheet (cheapest base rate) against the advisor (best on-time, never a weak lane)
"""
import hashlib
from datetime import date, datetime, timedelta

from sqlalchemy import select

from app.analytics import views
from app.analytics.causes import PICK_LIST_CUTOFF_MINUTES, WEAK_CARRIER_LANES
from app.analytics.store import get_dataset
from app.db import get_session
from app.models import WarehouseRegionDistance

REGIONS = ["Midwest", "Northeast", "Southeast", "West"]
STATE_REGION = {
    **dict.fromkeys(["OH", "IN", "IL", "MI", "WI", "MN", "IA", "MO", "ND", "SD", "NE", "KS"], "Midwest"),
    **dict.fromkeys(["ME", "NH", "VT", "MA", "RI", "CT", "NY", "NJ", "PA"], "Northeast"),
    **dict.fromkeys(["DE", "MD", "DC", "VA", "WV", "NC", "SC", "GA", "FL", "KY", "TN", "AL", "MS", "AR", "LA",
                     "TX", "OK"], "Southeast"),
    **dict.fromkeys(["WA", "OR", "CA", "NV", "AZ", "UT", "CO", "ID", "MT", "WY", "NM", "AK", "HI"], "West"),
}

# Days from the received date to the promised date, as in every row of deliveries.csv.
PROMISE_DAYS = {"same_day": 1, "next_day": 2, "standard": 4}

OUT_OF_STOCK_RATE = 12  # percent, matching the 12% of deliveries whose nearest warehouse had no stock
STOCK_SALT = "stock"  # fixed so the simulation never changes between runs
# Fixed stock-outs so the demo is repeatable (sample email 08: HX-4410 is not at W5 West).
FORCED_OUT_OF_STOCK = {("HX-4410", "W5")}


def region_for_state(state: str | None) -> str | None:
    return STATE_REGION.get((state or "").strip().upper())


def warehouses_by_distance(region: str) -> list[tuple[str, int]]:
    """[(warehouse_id, miles)] nearest first."""
    with get_session() as s:
        rows = s.scalars(select(WarehouseRegionDistance)).all()
        return sorted(((r.warehouse_id, int(getattr(r, region))) for r in rows), key=lambda x: (x[1], x[0]))


def in_stock(sku: str, warehouse_id: str) -> bool:
    """Simulated stock: deterministic, about 88% of SKU x warehouse pairs are in stock."""
    if (sku.upper(), warehouse_id) in FORCED_OUT_OF_STOCK:
        return False
    h = int(hashlib.sha256(f"{STOCK_SALT}|{sku.upper()}|{warehouse_id}".encode()).hexdigest()[:8], 16) % 100
    return h >= OUT_OF_STOCK_RATE


def stock_plan(region: str, skus: list[str]) -> dict:
    """Nearest warehouse, and the nearest one that holds every line (None if no warehouse has them all)."""
    ranked = warehouses_by_distance(region)
    nearest_id, nearest_miles = ranked[0]
    stock = {wid: {sku: in_stock(sku, wid) for sku in skus} for wid, _ in ranked}
    fulfil = next(((wid, miles) for wid, miles in ranked if all(stock[wid].values())), (None, None))
    return {"nearest_warehouse_id": nearest_id, "nearest_distance_miles": nearest_miles,
            "fulfilment_warehouse_id": fulfil[0], "distance_miles": fulfil[1],
            "missing_at_nearest": [sku for sku, ok in stock[nearest_id].items() if not ok],
            "stock_by_warehouse": stock}


def promise(commitment: str, received_at: datetime, requested_date: date | None = None) -> dict:
    """Pick-list date (08:00 cutoff) and promised date. A same-day order after the cutoff is re-promised
    as next-day, because today's pick list is already printed."""
    after = received_at.hour * 60 + received_at.minute >= PICK_LIST_CUTOFF_MINUTES
    received = received_at.date()
    pick_list = received + timedelta(days=1 if after else 0)
    effective = "next_day" if commitment == "same_day" and after else commitment
    promised = received + timedelta(days=PROMISE_DAYS[effective])
    if requested_date and requested_date > promised:
        promised = requested_date  # the client asked for later than we could do
    return {"after_cutoff": after, "pick_list_date": pick_list, "commitment_type": effective,
            "requested_commitment": commitment, "re_promised": effective != commitment,
            "promised_date": promised,
            "requested_date_missed": bool(requested_date and requested_date < promised)}


def _carrier_row(carriers, matrix, cid: str, region: str) -> dict:
    c = carriers.loc[cid]
    return {"carrier_id": cid, "carrier_name": c.carrier_name, "base_rate_usd": float(c.base_rate_usd),
            "on_time_rate": matrix[region].get(cid), "weak_lane": (cid, region) in WEAK_CARRIER_LANES,
            "preferred_supplier": c.preferred_supplier_agreement == "Y"}


def choose_carrier(region: str, ds=None) -> dict:
    """Old way: cheapest base rate from the rate card. Advisor: best on-time to this region from the
    scorecard, never a weak lane (ties go to the cheaper carrier)."""
    ds = ds or get_dataset()
    carriers = ds.carriers.set_index("carrier_id")
    matrix = views.carrier_scorecard(ds)["matrix"]
    cheapest = min(carriers.index, key=lambda cid: (float(carriers.loc[cid].base_rate_usd), cid))
    options = [cid for cid in matrix[region] if (cid, region) not in WEAK_CARRIER_LANES]
    best = min(options, key=lambda cid: (-matrix[region][cid], float(carriers.loc[cid].base_rate_usd), cid))
    old, new = _carrier_row(carriers, matrix, cheapest, region), _carrier_row(carriers, matrix, best, region)
    extra = new["base_rate_usd"] - old["base_rate_usd"]
    if best == cheapest:
        reason = (f"{new['carrier_name']} is both the cheapest and the best on-time carrier to the {region} "
                  f"({new['on_time_rate']:.0%}).")
    else:
        weak = (f", a known weak lane ({old['carrier_name']} to the {region})" if old["weak_lane"] else "")
        reason = (f"The rate card would pick {old['carrier_name']} (cheapest at ${old['base_rate_usd']:.2f}), "
                  f"{old['on_time_rate']:.0%} on time to the {region}{weak}. {new['carrier_name']} is "
                  f"{new['on_time_rate']:.0%} on time there for ${extra:.2f} more per shipment.")
    return {"region": region, "spreadsheet_pick": old, "advisor_pick": new,
            "overrides_spreadsheet": best != cheapest, "reason": reason}
