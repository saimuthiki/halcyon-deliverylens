"""Money side of the analysis: savings, fix costs, scenarios (same maths as analysis/root_cause_analysis.py)."""
from typing import Mapping

from app.analytics.causes import (CAUSES, FIX_COST_USD_PER_YEAR, PROCESS_CAUSES, REALISTIC_EFFECTIVENESS,
                                  ROUTING_CAUSES, VENDOR_BUDGET_USD)

ANNUALISE = 2  # the data covers six months
BENCHMARK = 0.94


def fixed(causes) -> dict[str, float]:
    return {c: (1.0 if c in causes else 0.0) for c in CAUSES}


def _late_totals_by_key(ds) -> dict[int, tuple[int, float, float]]:
    """Per cause combination: late deliveries, their SLA penalties and their redelivery cost."""
    df = ds.deliveries
    late = df.late.to_numpy()
    out: dict[int, tuple[int, float, float]] = {}
    for k, pen, red in zip(ds.combos.keys[late], df.penalty_usd.to_numpy()[late],
                           df.redelivery_cost_usd.to_numpy()[late]):
        n, p, r = out.get(int(k), (0, 0.0, 0.0))
        out[int(k)] = (n + 1, p + float(pen), r + float(red))
    return out


def yearly_savings(ds, effectiveness: Mapping[str, float]) -> dict:
    """Penalties and redelivery costs avoided per year (six months x2).

    A late delivery in cause group k turns on time with probability
    (expected rate after the fix - observed rate) / (1 - observed rate).
    """
    model = ds.combos
    after = model.expected_by_key(effectiveness)
    late = penalties = redelivery = 0.0
    for k, (n, pen, red) in _late_totals_by_key(ds).items():
        base = model.rate[k]
        flip = 0.0 if base >= 1 else max(0.0, (after[k] - base) / (1 - base))
        late += flip * n
        penalties += flip * pen
        redelivery += flip * red
    return {
        "sla_penalties_avoided_usd": round(penalties * ANNUALISE),
        "redelivery_avoided_usd": round(redelivery * ANNUALISE),
        "late_deliveries_avoided": round(late * ANNUALISE),
    }


def carrier_switch_cost(ds) -> int:
    """Extra yearly carrier spend if weak-lane shipments move to the other carriers' average rate."""
    df = ds.deliveries
    weak = df[df.weak_carrier_lane]
    good_rate = df[~df.weak_carrier_lane].groupby("destination_region").carrier_rate_usd.mean()
    extra = (weak.destination_region.map(good_rate) - weak.carrier_rate_usd).clip(lower=0).sum()
    return round(float(extra) * ANNUALISE)


def fix_costs(ds) -> dict[str, int]:
    return dict(FIX_COST_USD_PER_YEAR, weak_carrier_lane=carrier_switch_cost(ds))


def effectiveness_for_target(ds, target: float = BENCHMARK) -> float:
    """Smallest equal effectiveness across all five fixes that reaches `target` (bisection, 2 decimals)."""
    lo, hi = 0.0, 1.0
    for _ in range(12):
        mid = (lo + hi) / 2
        if ds.combos.expected({c: mid for c in CAUSES}) >= target:
            hi = mid
        else:
            lo = mid
    return round(hi, 2)


def scenario(ds, name: str, effectiveness: Mapping[str, float], cost_per_year: int) -> dict:
    today = 1 - ds.deliveries.late.mean()
    otd = ds.combos.expected(effectiveness)
    saving = yearly_savings(ds, effectiveness)
    total_saving = saving["sla_penalties_avoided_usd"] + saving["redelivery_avoided_usd"]
    return {
        "name": name,
        "on_time_rate": round(otd, 4),
        "points_gained": round((otd - today) * 100, 1),
        **saving,
        "cost_per_year_usd": cost_per_year,
        "net_benefit_per_year_usd": total_saving - cost_per_year,
        "net_benefit_penalties_only_usd": saving["sla_penalties_avoided_usd"] - cost_per_year,
    }


def scenarios(ds, costs: Mapping[str, int]) -> list[dict]:
    def cost_of(causes):
        return sum(costs[c] for c in causes)

    realistic = {c: REALISTIC_EFFECTIVENESS[c] for c in CAUSES}
    return [
        scenario(ds, "Routing vendor only (ceiling)", fixed(ROUTING_CAUSES), VENDOR_BUDGET_USD),
        scenario(ds, "Process fixes only (ceiling)", fixed(PROCESS_CAUSES), cost_of(PROCESS_CAUSES)),
        scenario(ds, "All five fixes, realistic", realistic, cost_of(CAUSES)),
        scenario(ds, "All five fixes, ceiling", fixed(CAUSES), cost_of(CAUSES)),
    ]


def roi_view(ds) -> dict:
    f = ds.findings
    return {
        "assumptions": {
            "effectiveness": {c["cause"]: c["realistic_effectiveness"] for c in f["causes"]},
            "fix_cost_per_year_usd": {c["cause"]: c["fix_cost_per_year_usd"] for c in f["causes"]},
            "note": "Costs are our estimates to confirm with Halcyon; money is six months x2",
        },
        "scenarios": f["scenarios"],
        "effectiveness_needed_for_94_benchmark": f["effectiveness_needed_for_94_benchmark"],
    }
