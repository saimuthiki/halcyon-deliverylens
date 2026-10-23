"""What-if simulator: partial fixes per cause -> projected on-time rate and money saved."""
from typing import Mapping

import numpy as np

from app.analytics.combos import shapley
from app.analytics.roi import yearly_savings


def simulate(ds, fixes: Mapping[str, float]) -> dict:
    model = ds.combos
    eff = {c: float(e) for c, e in fixes.items() if float(e) > 0}
    today = model.on_time_if_fixed(set())
    projected = model.expected(eff)
    points = shapley(list(eff), lambda s: model.expected({c: eff[c] for c in s})) if eff else {}

    at_risk_sel = ds.deliveries.client_id.isin(ds.at_risk_client_ids).to_numpy()
    at_risk_counts = model.counts_for(at_risk_sel)
    at_risk_today = 1 - ds.deliveries.late.to_numpy()[at_risk_sel].mean()
    at_risk_projected = at_risk_today + model.expected(eff, at_risk_counts) - model.expected({}, at_risk_counts)

    saved = yearly_savings(ds, eff)
    return {
        "fixes": {c: float(e) for c, e in fixes.items()},
        "today_on_time_rate": round(today, 4),
        "projected_on_time_rate": round(projected, 4),
        "projected_on_time_rate_exact": float(projected),
        "points_gained": round((projected - today) * 100, 1),
        "points_by_cause": {c: round(p * 100, 2) for c, p in points.items()},
        "at_risk": {
            "today_on_time_rate": round(float(at_risk_today), 4),
            "projected_on_time_rate": round(float(np.clip(at_risk_projected, 0, 1)), 4),
        },
        "annual_sla_penalties_avoided_usd": saved["sla_penalties_avoided_usd"],
        "annual_redelivery_cost_avoided_usd": saved["redelivery_avoided_usd"],
        "annual_late_deliveries_avoided": saved["late_deliveries_avoided"],
        "method": ("Each cause is removed from a share of deliveries equal to its effectiveness; each delivery "
                   "then takes the observed on-time rate of deliveries with its remaining causes. Money is "
                   "six months of data x2."),
    }
