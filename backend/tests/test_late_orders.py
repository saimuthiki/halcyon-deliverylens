"""Same-day orders after 08:00: grace period, urgent orders only, hard stop, and POST /api/simulate/late-orders."""
import time

import pytest

GRACE, HARD = "09:00", "10:00"


def _decide(hhmm, *, tier="Tier 3", at_risk=False, urgency="none", grace=GRACE, hard=HARD):
    from app.analytics.late_orders import minutes_of, same_day_decision

    return same_day_decision(minutes_of(hhmm), tier=tier, at_risk=at_risk, urgency=urgency,
                             grace_until=grace, hard_stop=hard)


# ---------------------------------------------------------------- the rule
@pytest.mark.parametrize("hhmm, kw, window, today", [
    ("07:59", {}, "before_cutoff", True),
    ("08:00", {}, "grace", True),
    ("08:35", {}, "grace", True),                                  # any order, not urgent
    ("09:00", {}, "urgent_window", False),                         # not urgent
    ("09:00", dict(tier="Tier 1"), "urgent_window", False),        # priority client, not urgent
    ("09:40", dict(urgency="high"), "urgent_window", True),        # valid reason, any client
    ("09:15", dict(urgency="medium"), "urgent_window", False),     # "URGENT!!!" from a Tier 3 client
    ("09:20", dict(urgency="medium", tier="Tier 1"), "urgent_window", True),
    ("09:20", dict(urgency="medium", tier="Tier 2", at_risk=True), "urgent_window", True),
    ("09:59", dict(urgency="medium", tier="Tier 2"), "urgent_window", False),
    ("10:00", dict(urgency="high", tier="Tier 1", at_risk=True), "after_hard_stop", False),
    ("13:59", dict(urgency="high"), "after_hard_stop", False),
])
def test_same_day_decision(hhmm, kw, window, today):
    d = _decide(hhmm, **kw)
    assert (d["window"], d["added_today"]) == (window, today)
    assert d["reason"]


def test_priority_client_is_tier_1_or_at_risk():
    from app.analytics.late_orders import priority_client

    assert priority_client("Tier 1", False).startswith("Tier 1")
    assert priority_client("Tier 3", True) == "at risk of leaving"
    assert priority_client("Tier 2", False) is None


def test_times_are_configurable():
    assert _decide("09:30", grace="10:00", hard="11:00")["window"] == "grace"
    assert _decide("10:30", urgency="high", grace="10:00", hard="11:00")["added_today"] is True
    assert _decide("08:10", grace="08:00", hard="08:00")["window"] == "after_hard_stop"  # strict 08:00


@pytest.mark.parametrize("grace, hard", [("10:00", "09:00"), ("07:30", "10:00"), ("09:15", "10:00"),
                                         ("09:00", "14:30"), ("9:00", "10:00"), ("late", "10:00")])
def test_bad_times_are_rejected(grace, hard):
    from app.analytics.late_orders import check_times

    with pytest.raises(ValueError):
        check_times(grace, hard)


def test_rule_table_names_the_configured_times():
    from app.analytics.late_orders import decision_rules

    rows = decision_rules("09:30", "11:00")
    assert rows[1]["when"] == "08:00 to 09:30" and rows[-1]["when"] == "From 11:00"
    assert {r["result"] for r in rows} == {"today", "tomorrow"}


# ---------------------------------------------------------------- replay
def test_population_is_the_after_cutoff_same_day_orders(dataset):
    from app.analytics.late_orders import simulate_late_orders

    p = simulate_late_orders(dataset)["population"]
    assert p["after_cutoff_same_day"] == int(dataset.deliveries.same_day_after_cutoff.sum()) == 4826
    assert p["grace_orders"] + p["urgent_window_orders"] + p["after_hard_stop_orders"] == 4826
    assert p["days"] == 178 and p["warehouses"] == 5


def test_grace_adds_every_complete_order_and_urgent_window_is_an_upper_bound(dataset):
    from app.analytics.late_orders import simulate_late_orders

    r = simulate_late_orders(dataset)
    p, g, u = r["population"], r["grace"], r["urgent_priority_clients_at_most"]
    assert 0 < g["orders"] <= p["grace_orders"]
    assert 0 < u["orders"] <= p["urgent_window_priority_client_orders"]
    assert u["orders"] + r["urgent_other_clients_with_valid_reason"] <= p["urgent_window_orders"]
    assert g["late_avoided_per_year"] > 0 and g["extra_orders_per_warehouse_day"] < 2
    ot = r["on_time_rate_after_cutoff_orders"]
    assert ot["today"] < ot["with_grace"] < ot["with_grace_and_urgent_at_most"]


def test_no_grace_and_strict_hard_stop_adds_nothing(dataset):
    from app.analytics.late_orders import simulate_late_orders

    r = simulate_late_orders(dataset, "08:00", "08:00")
    assert r["grace"]["orders"] == 0 and r["urgent_priority_clients_at_most"]["orders"] == 0
    ot = r["on_time_rate_after_cutoff_orders"]
    assert ot["today"] == ot["with_grace"] == ot["with_grace_and_urgent_at_most"]


def test_longer_grace_never_avoids_fewer_late_deliveries(dataset):
    from app.analytics.late_orders import simulate_late_orders

    late = [simulate_late_orders(dataset, g, "12:00")["grace"]["late_avoided_per_year"]
            for g in ("08:00", "08:30", "09:00", "10:00", "12:00")]
    assert late == sorted(late)


def test_arrivals_cover_08_to_14_in_half_hours(dataset):
    from app.analytics.late_orders import simulate_late_orders

    a = simulate_late_orders(dataset)["arrivals"]
    assert a[0]["from"] == "08:00" and a[-1]["to"] == "14:00" and len(a) == 12
    assert sum(x["orders"] for x in a) == 4826
    assert [x["window"] for x in a[:4]] == ["grace", "grace", "urgent_window", "urgent_window"]


def test_simulation_is_deterministic_and_fast(dataset):
    from app.analytics import late_orders

    late_orders.clear_cache()
    t0 = time.perf_counter()
    a = late_orders.simulate_late_orders(dataset, "09:30", "11:00")
    assert time.perf_counter() - t0 < 1.0
    late_orders.clear_cache()
    assert late_orders.simulate_late_orders(dataset, "09:30", "11:00") == a


# ---------------------------------------------------------------- API
def test_endpoint_defaults_to_the_order_desk_settings(client):
    r = client.post("/api/simulate/late-orders", json={})
    assert r.status_code == 200, r.text
    b = r.json()
    assert b["inputs"] == {"pick_list_cutoff": "08:00", "grace_until": GRACE, "hard_stop": HARD}
    assert b["order_desk_settings"] == {"grace_until": GRACE, "hard_stop": HARD}
    assert client.post("/api/simulate/late-orders").json()["inputs"] == b["inputs"]  # body optional


def test_endpoint_takes_times(client):
    b = client.post("/api/simulate/late-orders", json={"grace_until": "08:30", "hard_stop": "11:00"}).json()
    assert b["inputs"]["grace_until"] == "08:30" and b["inputs"]["hard_stop"] == "11:00"


@pytest.mark.parametrize("body", [{"grace_until": "10:30", "hard_stop": "10:00"}, {"grace_until": "9am"},
                                  {"hard_stop": "15:00"}, {"grace_until": "09:10"}])
def test_endpoint_rejects_bad_times(client, body):
    assert client.post("/api/simulate/late-orders", json=body).status_code == 422


# ---------------------------------------------------------------- SLA money per avoided late delivery
def _expected_by_hand(dataset, client_id):
    df = dataset.deliveries
    sla = set(dataset.clients.loc[dataset.clients.sla_penalty_clause == "Y", "client_id"])
    own = df[df.client_id == client_id]
    if own.late.sum():
        return float(own.penalty_usd.sum()) / int(own.late.sum())
    pool = df[df.client_id.isin(sla)]
    return float(pool.penalty_usd.sum()) / int(pool.late.sum())


def test_expected_penalty_is_total_penalties_over_late_deliveries(dataset):
    from app.analytics.late_orders import expected_penalty_per_late

    sla = dataset.clients.loc[dataset.clients.sla_penalty_clause == "Y", "client_id"].tolist()
    for cid in sla[:5]:
        assert expected_penalty_per_late(dataset, cid) == pytest.approx(_expected_by_hand(dataset, cid))
    no_clause = dataset.clients.loc[dataset.clients.sla_penalty_clause == "N", "client_id"].iloc[0]
    assert expected_penalty_per_late(dataset, no_clause) == 0.0


def test_replay_values_an_avoided_late_delivery_at_the_expected_penalty(dataset):
    from app.analytics import late_orders

    late_orders.clear_cache()
    pop = late_orders._pop_for(dataset)
    row = pop[pop.penalty_value > 0].iloc[0]
    assert row.penalty_value == pytest.approx(_expected_by_hand(dataset, row.client_id))
    assert "expected SLA penalty per late delivery" in late_orders.simulate_late_orders(dataset)["method"]
