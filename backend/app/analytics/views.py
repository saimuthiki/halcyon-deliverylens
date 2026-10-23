"""Read-only views over the dataset, shaped for the API."""
import math

import pandas as pd

from app.analytics.causes import CAUSES, PICK_LIST_CUTOFF_MINUTES, causes_of
from app.analytics.store import DATE_COLS, TS_COLS

PUBLIC_DELIVERY_COLS = [
    "delivery_id", "order_id", "client_id", "order_channel", "email_format_id", "order_received_ts",
    "commitment_type", "promised_date", "address_status", "pick_list_date", "shipped_ts",
    "destination_region", "nearest_warehouse_id", "fulfilment_warehouse_id", "nearest_warehouse_had_stock",
    "distance_miles", "carrier_id", "carrier_rate_usd", "stops_on_route", "planned_route_km",
    "actual_route_km", "delivered_date", "days_late", "on_time", "redelivery_cost_usd",
]


def clean_value(col: str, v):
    if v is None or (isinstance(v, float) and math.isnan(v)) or v is pd.NaT:
        return None
    if col in DATE_COLS:
        return v.date().isoformat()
    if col in TS_COLS:
        return v.strftime("%Y-%m-%d %H:%M")
    if hasattr(v, "item"):
        v = v.item()
    if isinstance(v, float) and v.is_integer() and col in {"email_format_id"}:
        return int(v)
    return v


def delivery_row(row) -> dict:
    return {c: clean_value(c, row[c]) for c in PUBLIC_DELIVERY_COLS}


# ---------- KPIs ----------
def kpis(ds) -> dict:
    df, f = ds.deliveries, ds.findings
    by_month = (df.assign(month=df.order_received_ts.dt.strftime("%Y-%m"))
                  .groupby("month").late.agg(["size", "mean"]).reset_index())
    return {
        "deliveries": f["deliveries"],
        "period": f["period"],
        "on_time_rate": f["on_time_rate_today"],
        "late": f["data_quality"]["late_deliveries"],
        "by_month": [{"month": r.month, "on_time_rate": round(1 - r["mean"], 4), "deliveries": int(r["size"])}
                     for _, r in by_month.iterrows()],
        "sla_penalties_usd": f["money"]["sla_penalties_6_months_usd"],
        "redelivery_cost_usd": f["money"]["redelivery_cost_6_months_usd"],
        "at_risk_clients": f["money"]["at_risk_clients"],
        "at_risk_revenue_usd": f["money"]["at_risk_annual_revenue_usd"],
        "at_risk_on_time_rate": f["money"]["at_risk_on_time_rate"],
        "complaints_total": f["complaints"]["total"],
        "complaints_by_category": f["complaints"]["by_category"],
        "complaints_from_at_risk_clients": f["complaints"]["from_at_risk_clients"],
        "customer_success_hours": f["customer_success_week"],
    }


# ---------- Causes ----------
def causes_view(ds) -> dict:
    f = ds.findings
    rows = [{
        "cause": c["cause"], "label": c["label"], "deliveries": c["deliveries"],
        "on_time_rate": c["on_time_rate"], "share_of_late": c["share_of_late_deliveries"],
        "points_if_fixed_alone": c["points_gained_if_fixed_alone"],
        "fair_share_points": c["fair_share_points"], "sla_penalties_usd": c["sla_penalties_usd"],
    } for c in f["causes"]]
    return {
        "causes": rows,
        "scenarios": {
            "today": f["on_time_rate_today"],
            "all_fixed": f["on_time_if_all_fixed"],
            "routing_only": f["on_time_if_only_routing_fixed"],
            "process_only": f["on_time_if_only_process_fixed"],
            "no_problem_rate": f["on_time_rate_with_no_problem"],
        },
    }


def cause_deliveries(ds, cause: str, limit: int) -> dict:
    df = ds.deliveries
    sample = df[df[cause] & df.late].head(limit)
    rows = []
    for _, r in sample.iterrows():
        rows.append({**{c: clean_value(c, r[c]) for c in (
            "delivery_id", "client_id", "order_received_ts", "commitment_type", "destination_region",
            "carrier_id", "promised_date", "delivered_date", "days_late", "on_time")}, "causes": causes_of(r)})
    return {"cause": cause, "label": CAUSES[cause], "total_late_with_cause": int((df[cause] & df.late).sum()),
            "deliveries": rows}


# ---------- Single delivery ----------
def _cause_sentence(cause: str, r) -> str:
    if cause == "incomplete_address":
        return "the delivery address was incomplete when the order came in, so it had to be chased before shipping"
    if cause == "same_day_after_cutoff":
        return (f"it was a same-day order received at {r.order_received_ts:%H:%M}, after the "
                f"{PICK_LIST_CUTOFF_MINUTES // 60:02d}:00 pick-list cutoff, so it went on the "
                f"{r.pick_list_date:%Y-%m-%d} pick list")
    if cause == "stock_not_at_nearest":
        return (f"the nearest warehouse ({r.nearest_warehouse_id}) had no stock, so it shipped from "
                f"{r.fulfilment_warehouse_id}, {int(r.distance_miles)} miles away")
    if cause == "weak_carrier_lane":
        return f"carrier {r.carrier_id} is one of the weakest carriers for the {r.destination_region} region"
    if cause == "route_deviation":
        pct = round((r.actual_route_km / r.planned_route_km - 1) * 100)
        return (f"the driver went {pct}% beyond the planned route ({r.actual_route_km:g} km driven vs "
                f"{r.planned_route_km:g} km planned)")
    raise ValueError(cause)


def explain(ds, r) -> str:
    client = ds.clients.set_index("client_id").client_name.get(r.client_id, r.client_id)
    commitment = r.commitment_type.replace("_", "-")
    head = (f"Delivery {r.delivery_id} for {client} ({r.client_id}) was a {commitment} order promised for "
            f"{r.promised_date:%Y-%m-%d}.")
    days = int(r.days_late)
    if r.late:
        head += f" It was delivered on {r.delivered_date:%Y-%m-%d}, {days} day{'s' if days != 1 else ''} late."
    else:
        head += f" It was delivered on time on {r.delivered_date:%Y-%m-%d}."
    causes = causes_of(r)
    if causes:
        reasons = "; ".join(_cause_sentence(c, r) for c in causes)
        verb = "Why it was late" if r.late else "Risk factors present (it still arrived on time)"
        return f"{head} {verb}: {reasons}."
    if r.late:
        return f"{head} None of the five known causes applies, so this looks like ordinary variation."
    return f"{head} None of the five known causes applies."


def delivery_detail(ds, delivery_id: str) -> dict | None:
    if delivery_id not in ds.by_id.index:
        return None
    r = ds.by_id.loc[delivery_id]
    timeline = [
        {"event": "received", "at": clean_value("order_received_ts", r.order_received_ts)},
        {"event": "pick_list", "at": clean_value("pick_list_date", r.pick_list_date)},
        {"event": "shipped", "at": clean_value("shipped_ts", r.shipped_ts)},
        {"event": "promised", "at": clean_value("promised_date", r.promised_date)},
        {"event": "delivered", "at": clean_value("delivered_date", r.delivered_date)},
    ]
    return {
        "delivery": delivery_row(r),
        "timeline": timeline,
        "causes": [{"cause": c, "label": CAUSES[c]} for c in causes_of(r)],
        "sla_penalty_usd": float(r.penalty_usd),
        "explanation": explain(ds, r),
    }


# ---------- Carriers ----------
def carrier_scorecard(ds) -> dict:
    df, carriers = ds.deliveries, ds.carriers.set_index("carrier_id")
    agg = df.groupby("carrier_id").agg(deliveries=("late", "size"), late=("late", "mean"),
                                      redelivery=("redelivery_cost_usd", lambda s: (s > 0).mean()),
                                      avg_rate=("carrier_rate_usd", "mean"))
    rows = []
    for cid, a in agg.iterrows():
        c = carriers.loc[cid]
        rows.append({
            "carrier_id": cid, "carrier_name": c.carrier_name, "base_rate_usd": float(c.base_rate_usd),
            "avg_rate_usd": round(float(a.avg_rate), 2), "deliveries": int(a.deliveries),
            "on_time_rate": round(1 - float(a.late), 4), "redelivery_rate": round(float(a.redelivery), 4),
            "has_api": c.has_api == "Y", "delivery_event_feed": c.delivery_event_feed,
            "preferred": c.preferred_supplier_agreement == "Y",
        })
    pivot = df.groupby(["destination_region", "carrier_id"]).late.mean()
    matrix: dict[str, dict[str, float]] = {}
    for (region, cid), late in pivot.items():
        matrix.setdefault(region, {})[cid] = round(1 - float(late), 3)
    recommended = {}
    for region, rates in matrix.items():
        best = min(rates, key=lambda cid: (-rates[cid], float(carriers.loc[cid].base_rate_usd), cid))
        recommended[region] = {"carrier_id": best, "carrier_name": carriers.loc[best].carrier_name,
                               "on_time_rate": rates[best], "base_rate_usd": float(carriers.loc[best].base_rate_usd)}
    from app.analytics.causes import WEAK_CARRIER_LANES
    return {"carriers": rows, "matrix": matrix, "recommended_by_region": recommended,
            "weak_lanes": [{"carrier_id": c, "region": r} for c, r in sorted(WEAK_CARRIER_LANES)]}


# ---------- Clients ----------
def at_risk_clients(ds) -> dict:
    df = ds.deliveries
    clients = ds.clients[ds.clients.account_status == "threatening_to_leave"]
    complaints = ds.complaints.client_id.value_counts()
    rows = []
    for _, c in clients.sort_values("annual_revenue_usd", ascending=False).iterrows():
        d = df[df.client_id == c.client_id]
        rows.append({
            "client_id": c.client_id, "client_name": c.client_name, "region": c.region,
            "account_tier": c.account_tier, "primary_order_channel": c.primary_order_channel,
            "sla_penalty_clause": c.sla_penalty_clause == "Y",
            "annual_revenue_usd": int(c.annual_revenue_usd), "deliveries": int(len(d)),
            "on_time_rate": round(1 - float(d.late.mean()), 4) if len(d) else None,
            "cause_rates": {k: round(float(d[k].mean()), 4) if len(d) else 0.0 for k in CAUSES},
            "sla_penalties_usd": int(d.penalty_usd.sum()),
            "complaints": int(complaints.get(c.client_id, 0)),
        })
    return {"clients": rows, "total_annual_revenue_usd": int(clients.annual_revenue_usd.sum())}
