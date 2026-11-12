"""Pilot target for the pitch deck: how far each fix must work to beat the 94% industry benchmark.

Uses the same model as analysis/root_cause_analysis.py (expected_on_time, yearly_savings); only the
effectiveness per fix is set higher than the cautious "realistic" case. These are targets a pilot
must prove, not measurements. Writes deck/target-scenario.json, which build_deck.js reads.
Run from the repo root:  python deck/target_scenario.py
"""
import json
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "analysis"))
import root_cause_analysis as r  # noqa: E402

# Share of each cause we aim to remove in the pilot (target, to be measured weekly).
TARGET = {
    "weak_carrier_lane": 0.95,      # move the 7 weak lanes to the carrier that is strong there
    "incomplete_address": 0.92,     # intake agent asks the client before the order ships
    "same_day_after_cutoff": 0.90,  # grace hour to 09:00, urgent orders until 10:00
    "stock_not_at_nearest": 0.80,   # ship from the nearest warehouse with stock, monthly rebalancing
    "route_deviation": 0.70,        # routing pilot only on the lanes that drift
}


def main():
    df = r.load()
    penalties = pd.read_csv(r.DATA / "sla_penalties.csv")
    costs = dict(r.FIX_COST_USD_PER_YEAR, weak_carrier_lane=r.carrier_switch_cost(df))
    sc = r.scenario(df, "Pilot target", TARGET, penalties, sum(costs.values()))
    base = 1 - df.late.mean()
    # Waterfall steps: each cause's fair share times its target, scaled to the model's total gain.
    shares = r.fair_share(df)
    raw = {c: shares[c] * TARGET[c] for c in TARGET}
    total = (sc["on_time_rate"] - base) * 100
    steps = {c: round(v / sum(raw.values()) * total, 1) for c, v in raw.items()}
    out = {"effectiveness": TARGET, "on_time_today": round(base, 4), "steps_points": steps, "scenario": sc}
    (Path(__file__).parent / "target-scenario.json").write_text(json.dumps(out, indent=2))
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
