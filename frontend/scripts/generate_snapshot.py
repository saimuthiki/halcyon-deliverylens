"""Regenerate frontend/src/api/mockSnapshot.ts (the offline fallback) from the analysis.

Reads analysis/output/findings.json and the dataset, reusing the tagging in
analysis/root_cause_analysis.py so the sample data matches the API exactly.

Run from the repository root:
    backend/.venv/bin/python frontend/scripts/generate_snapshot.py
"""
import json
import sys
from datetime import date
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "analysis"))
import root_cause_analysis as rca  # noqa: E402

DATA = ROOT / "data" / "halcyon-dataset"
OUT = ROOT / "frontend" / "src" / "api" / "mockSnapshot.ts"
CAUSES = list(rca.CAUSES)


def r4(x):
    return None if pd.isna(x) else round(float(x), 4)


def ts(v):
    return None if pd.isna(v) else str(v)[:16]


def main():
    findings = json.loads((ROOT / "analysis" / "output" / "findings.json").read_text())
    df = rca.load()
    clients = pd.read_csv(DATA / "clients.csv")
    carriers = pd.read_csv(DATA / "carriers.csv")
    warehouses = pd.read_csv(DATA / "warehouses.csv")
    penalties = pd.read_csv(DATA / "sla_penalties.csv")
    df = df.merge(penalties[["delivery_id", "penalty_usd"]], on="delivery_id", how="left").fillna({"penalty_usd": 0})

    # ---- monthly
    df["month"] = df.order_received_ts.dt.strftime("%Y-%m")
    monthly = [
        {"month": m, "deliveries": int(len(g)), "late": int(g.late.sum()),
         "on_time_rate": r4(1 - g.late.mean()), "penalties_usd": int(g.penalty_usd.sum())}
        for m, g in df.groupby("month")
    ]

    # ---- carriers
    weak = rca.WEAK_CARRIER_LANES
    cards = []
    for _, c in carriers.iterrows():
        d = df[df.carrier_id == c.carrier_id]
        late = d[d.late]
        cards.append({
            "carrier_id": c.carrier_id,
            "carrier_name": f"Carrier {c.carrier_id}",
            "deliveries": int(len(d)),
            "on_time_rate": r4(1 - d.late.mean()),
            "avg_days_late": round(float(late.days_late.mean()), 2),
            "has_api": str(c.get("has_api", "N")).upper().startswith("Y"),
            "event_feed": str(c.get("delivery_event_feed", "")),
            "preferred_supplier": str(c.get("preferred_supplier_agreement", "N")).upper().startswith("Y"),
            "base_rate_usd": float(c.get("base_rate_usd", 0)),
            "weak_regions": sorted(r for (cid, r) in weak if cid == c.carrier_id),
        })
    matrix = []
    for (cid, region), g in df.groupby(["carrier_id", "destination_region"]):
        matrix.append({"carrier_id": cid, "region": region, "deliveries": int(len(g)),
                       "on_time_rate": r4(1 - g.late.mean()), "weak": (cid, region) in weak})
    recs = []
    for region in sorted(df.destination_region.unique()):
        cells = [m for m in matrix if m["region"] == region]
        best = max((m for m in cells if not m["weak"]), key=lambda m: m["on_time_rate"])
        worst = min(cells, key=lambda m: m["on_time_rate"])
        recs.append({"region": region, "recommended_carrier": best["carrier_id"], "on_time_rate": best["on_time_rate"],
                     "avoid_carrier": worst["carrier_id"], "avoid_on_time_rate": worst["on_time_rate"]})

    # ---- at-risk clients
    at_risk = []
    for _, c in clients[clients.account_status == "threatening_to_leave"].sort_values("annual_revenue_usd", ascending=False).iterrows():
        d = df[df.client_id == c.client_id]
        rates = {k: float(d[k].mean()) for k in CAUSES}
        at_risk.append({
            "client_id": c.client_id, "client_name": c.client_name, "region": c.region,
            "tier": c.account_tier, "channel": c.primary_order_channel,
            "annual_revenue_usd": int(c.annual_revenue_usd), "deliveries": int(len(d)),
            "on_time_rate": r4(1 - d.late.mean()), "penalties_usd": int(d.penalty_usd.sum()),
            "main_causes": [k for k, _ in sorted(rates.items(), key=lambda kv: -kv[1])[:2]],
        })

    # ---- sample late deliveries per cause (same rule as the API: first N late in id order)
    samples = {}
    for cause in CAUSES:
        rows = []
        for _, r in df[df[cause] & df.late].head(8).iterrows():
            rows.append({
                "delivery_id": r.delivery_id, "client_id": r.client_id, "order_channel": r.order_channel,
                "commitment_type": r.commitment_type, "order_received_ts": ts(r.order_received_ts),
                "promised_date": r.promised_date, "delivered_date": r.delivered_date, "days_late": int(r.days_late),
                "destination_region": r.destination_region, "carrier_id": r.carrier_id,
                "nearest_warehouse_id": r.nearest_warehouse_id, "fulfilment_warehouse_id": r.fulfilment_warehouse_id,
                "address_status": r.address_status, "pick_list_date": r.pick_list_date, "shipped_ts": ts(r.shipped_ts),
                "distance_miles": int(r.distance_miles), "planned_route_km": r4(r.planned_route_km),
                "actual_route_km": r4(r.actual_route_km), "redelivery_cost_usd": float(r.redelivery_cost_usd),
                "causes": [k for k in CAUSES if bool(r[k])],
            })
        samples[cause] = rows

    # ---- cause combinations (lets the offline simulator use the same maths as the API)
    keys = rca.combo_keys(df)
    at_risk_ids = set(clients[clients.account_status == "threatening_to_leave"].client_id)
    combos = []
    for key, g in df.groupby(keys):
        late = g[g.late]
        combos.append({"key": key, "deliveries": int(len(g)), "at_risk_deliveries": int(g.client_id.isin(at_risk_ids).sum()),
                       "on_time_rate": float(1 - g.late.mean()),
                       "late_penalties_usd": int(late.penalty_usd.sum()),
                       "late_redelivery_usd": float(late.redelivery_cost_usd.sum()), "late": int(len(late))})

    # ---- typical delay per cause (median days late of its late deliveries), for the offline delay alert
    cause_delay = {c: float(df[df[c] & df.late].days_late.median()) for c in CAUSES}

    # ---- ROI (GET /api/roi)
    roi = {
        "assumptions": {
            "effectiveness": {c["cause"]: c["realistic_effectiveness"] for c in findings["causes"]},
            "fix_cost_per_year_usd": {c["cause"]: c["fix_cost_per_year_usd"] for c in findings["causes"]},
            "note": "Fix costs are our estimates, to be confirmed with Halcyon. Savings are yearly (six months of data x2). "
                    "The routing vendor scenario assumes the vendor fully removes both routing causes.",
        },
        "scenarios": findings["scenarios"],
        "effectiveness_needed_for_94_benchmark": findings["effectiveness_needed_for_94_benchmark"],
    }

    # ---- stock placement (GET /api/stock/placement), by nearest warehouse
    by_wh = []
    for _, w in warehouses.iterrows():
        d = df[df.nearest_warehouse_id == w.warehouse_id]
        so = d.stock_not_at_nearest
        by_wh.append({
            "warehouse_id": w.warehouse_id, "name": w.warehouse_name, "region": w.region,
            "deliveries": int(len(d)), "stock_out_rate": r4(so.mean()),
            "on_time_when_stocked": r4(1 - d[~so].late.mean()), "on_time_when_stock_out": r4(1 - d[so].late.mean()),
        })
    cl = df.groupby("client_id").agg(deliveries=("late", "size"), stock_out_rate=("stock_not_at_nearest", "mean"),
                                     late=("late", "mean"))
    cl = cl[cl.deliveries >= 50].sort_values(["stock_out_rate", "deliveries"], ascending=[False, False]).head(10)
    names = clients.set_index("client_id").client_name
    worst = [{"client_id": cid, "client_name": names.get(cid, cid), "deliveries": int(r.deliveries),
              "stock_out_rate": r4(r.stock_out_rate), "on_time_rate": r4(1 - r.late)} for cid, r in cl.iterrows()]

    # ---- route deviation (GET /api/routes/deviation)
    def dev_row(g):
        dev = g.route_deviation
        return {"deliveries": int(len(g)), "deviation_rate": r4(dev.mean()),
                "on_time_with_deviation": r4(1 - g[dev].late.mean()), "on_time_without_deviation": r4(1 - g[~dev].late.mean())}
    by_carrier = [{"carrier_id": c, **dev_row(g), "missing_actual_km_rate": r4(g.actual_route_km.isna().mean())}
                  for c, g in df.groupby("carrier_id")]
    by_region = [{"region": r, **dev_row(g)} for r, g in df.groupby("destination_region")]

    j = lambda x: json.dumps(x, indent=2)  # noqa: E731
    OUT.write_text(f"""/* eslint-disable */
// GENERATED by frontend/scripts/generate_snapshot.py from analysis/output/findings.json and
// data/halcyon-dataset ({date.today().isoformat()}). Static snapshot used when the API is unreachable.
// Do not edit by hand: re-run the script.
import type {{ AtRiskClient, CarrierScorecard, CauseKey, DeliverySummary, MonthlyPoint, RoiResponse, RouteDeviation, StockPlacement }} from './types';

export const FINDINGS = {j(findings)};

export const MONTHLY: MonthlyPoint[] = {j(monthly)};

export const SCORECARD: CarrierScorecard = {j({"carriers": cards, "matrix": matrix, "recommendations": recs})};

export const AT_RISK_CLIENTS: AtRiskClient[] = {j(at_risk)} as AtRiskClient[];

export const SAMPLE_DELIVERIES: Record<CauseKey, DeliverySummary[]> = {j(samples)} as Record<CauseKey, DeliverySummary[]>;

/** Cause order of each `key` bit: {", ".join(CAUSES)}. */
export const COMBO_CAUSES: CauseKey[] = {json.dumps(CAUSES)};

/** Every combination of the five causes seen in the data, with its on-time rate and the cost of its late deliveries (6 months). */
export const COMBOS = {j(combos)};

/** Median days late of the late deliveries that had each cause. */
export const CAUSE_DELAY_DAYS: Record<CauseKey, number> = {j(cause_delay)};

export const ROI: RoiResponse = {j(roi)};

export const STOCK_PLACEMENT: StockPlacement = {j({"by_warehouse": by_wh, "worst_clients": worst})};

export const ROUTE_DEVIATION: RouteDeviation = {j({"by_carrier": by_carrier, "by_region": by_region})};
""")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
