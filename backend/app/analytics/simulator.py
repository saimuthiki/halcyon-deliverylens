"""What-if simulator: partial fixes per cause -> projected on-time rate and money saved."""
from typing import Mapping

import numpy as np

from app.analytics.combos import shapley, subset_weights

ANNUALISE = 2  # the data covers six months


def _late_cost_by_key(ds, column: str) -> dict[int, float]:
    df = ds.deliveries
    late = df.late.to_numpy()
    keys = ds.combos.keys[late]
    costs = df[column].to_numpy()[late]
    out: dict[int, float] = {}
    for k, c in zip(keys, costs):
        out[int(k)] = out.get(int(k), 0.0) + float(c)
    return out


def _cost_avoided(ds, effectiveness: Mapping[str, float], cost_by_key: dict[int, float]) -> float:
    """Late deliveries that turn on-time take their penalty/redelivery cost with them."""
    model = ds.combos
    total = 0.0
    for mask, w in subset_weights(effectiveness):
        for key, cost in cost_by_key.items():
            today = model.rate[key]
            if today >= 1:
                continue
            converted = (model.rate_after(key, mask) - today) / (1 - today)
            total += w * cost * min(max(converted, 0.0), 1.0)
    return total


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

    penalties = _cost_avoided(ds, eff, _late_cost_by_key(ds, "penalty_usd")) if eff else 0.0
    redelivery = _cost_avoided(ds, eff, _late_cost_by_key(ds, "redelivery_cost_usd")) if eff else 0.0
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
        "annual_sla_penalties_avoided_usd": int(round(penalties * ANNUALISE)),
        "annual_redelivery_cost_avoided_usd": int(round(redelivery * ANNUALISE)),
        "method": ("Each cause is removed from a share of deliveries equal to its effectiveness; each delivery "
                   "then takes the observed on-time rate of deliveries with its remaining causes. Money is "
                   "six months of data x2."),
    }
