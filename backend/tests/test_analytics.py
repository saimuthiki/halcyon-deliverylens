"""Analytics must reproduce analysis/output/findings.json exactly."""
import json

import pytest

from conftest import FINDINGS_PATH


@pytest.fixture(scope="module")
def expected():
    return json.loads(FINDINGS_PATH.read_text())


def test_loader_loads_every_csv(loaded_db):
    assert loaded_db["deliveries"] == 48340
    assert loaded_db["clients"] == 280
    assert loaded_db["carriers"] == 6
    assert loaded_db["sla_penalties"] == 4847
    assert loaded_db["complaints"] == 34


def test_loader_is_idempotent(loaded_db):
    from app.db import get_engine
    from app.loader import load_all

    again = load_all(get_engine())
    assert again == loaded_db


def test_findings_match_analysis_output_exactly(dataset, expected):
    from app.analytics.findings import compute_findings

    # holdout_check is an analysis-only validation (lanes picked on Apr-Jun, tested on Jul-Sep);
    # the API does not serve it, so compare everything else.
    expected = {k: v for k, v in expected.items() if k != "holdout_check"}
    assert compute_findings(dataset) == expected


def test_headline_scenarios(dataset):
    f = dataset.findings
    assert f["on_time_rate_today"] == 0.71
    assert f["on_time_if_all_fixed"] == 0.99
    assert f["on_time_if_only_routing_fixed"] == 0.8024
    assert f["on_time_if_only_process_fixed"] == 0.8667
    assert f["on_time_realistic"] == 0.9024
    assert f["effectiveness_needed_for_94_benchmark"] == 0.84


def test_weak_lanes_match_analysis():
    from app.analytics.causes import CAUSES, WEAK_CARRIER_LANES

    assert WEAK_CARRIER_LANES == {("D", "Midwest"), ("D", "Northeast"), ("D", "Southeast"), ("D", "West"),
                                  ("E", "West"), ("F", "Northeast"), ("F", "Southeast")}
    assert CAUSES["weak_carrier_lane"] == ("Weak carrier on that lane (D everywhere, E to West, "
                                           "F to Northeast/Southeast)")


def test_fair_shares_add_up_to_total_gain(dataset):
    from app.analytics.combos import fair_share

    shares = fair_share(dataset.combos)
    total = sum(shares.values())
    assert total == pytest.approx(dataset.combos.on_time_if_fixed(set(shares)) - dataset.combos.on_time_if_fixed(set()))


def test_simulator_full_fix_equals_all_fixed(dataset):
    from app.analytics.causes import CAUSES
    from app.analytics.simulator import simulate

    out = simulate(dataset, {c: 1.0 for c in CAUSES})
    assert out["projected_on_time_rate"] == 0.99


def test_simulator_routing_only(dataset):
    from app.analytics.simulator import simulate

    out = simulate(dataset, {"weak_carrier_lane": 1.0, "route_deviation": 1.0})
    assert out["projected_on_time_rate"] == 0.8024


def test_simulator_realistic_preset_matches_analysis(dataset, expected):
    from app.analytics.causes import REALISTIC_EFFECTIVENESS
    from app.analytics.simulator import simulate

    out = simulate(dataset, REALISTIC_EFFECTIVENESS)
    realistic = next(s for s in expected["scenarios"] if s["name"] == "All five fixes, realistic")
    assert out["projected_on_time_rate"] == expected["on_time_realistic"] == 0.9024
    assert out["annual_sla_penalties_avoided_usd"] == realistic["sla_penalties_avoided_usd"]
    assert out["annual_redelivery_cost_avoided_usd"] == realistic["redelivery_avoided_usd"]
    assert out["annual_late_deliveries_avoided"] == realistic["late_deliveries_avoided"]


def test_simulator_half_effectiveness_is_linear_blend(dataset):
    from app.analytics.simulator import simulate

    full = simulate(dataset, {"incomplete_address": 1.0})["projected_on_time_rate_exact"]
    half = simulate(dataset, {"incomplete_address": 0.5})["projected_on_time_rate_exact"]
    today = dataset.combos.on_time_if_fixed(set())
    assert half == pytest.approx(today + (full - today) / 2)


def test_simulator_no_fix_changes_nothing(dataset):
    from app.analytics.simulator import simulate

    out = simulate(dataset, {})
    assert out["projected_on_time_rate"] == 0.71
    assert out["annual_sla_penalties_avoided_usd"] == 0
    assert out["points_gained"] == 0


def test_simulator_cost_avoided_full_fix_is_bounded(dataset):
    from app.analytics.causes import CAUSES
    from app.analytics.simulator import simulate

    out = simulate(dataset, {c: 1.0 for c in CAUSES})
    assert 0 < out["annual_sla_penalties_avoided_usd"] < 872460 * 2
    assert 0 < out["annual_redelivery_cost_avoided_usd"] < 476646 * 2


def test_vendor_assessment_recommends_reshape(dataset):
    from app.analytics.vendor import vendor_assessment

    v = vendor_assessment(dataset)
    assert v["verdict"] == "do_not_sign_as_scoped"
    assert v["routing_only_ceiling"] == 0.8024
    assert v["process_only"] == 0.8667 and v["realistic_all_five"] == 0.9024 and v["all_fixed"] == 0.99
    assert v["vendor_unique_points"] == 3.1
    assert any("needs no software" in r for r in v["reasons"])
    assert v["budget_usd"] == 680000
    assert v["at_risk_revenue_usd"] == 14200000
    assert "Do not sign as scoped" in v["recommendation"]
