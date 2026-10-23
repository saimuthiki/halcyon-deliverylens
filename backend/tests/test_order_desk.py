"""Order desk: the sample inbox, the 10-step pipeline and the /api/desk endpoints (mock LLM)."""
import json

import pytest

from conftest import REPO_ROOT

MANIFEST = json.loads((REPO_ROOT / "data" / "sample-inbox" / "manifest.json").read_text())["messages"]
EXPECTED = {m["id"]: m["expected_decision"] for m in MANIFEST}
STEP_KEYS = ["receive", "guardrail", "extract", "identify_client", "address_check", "promise_check",
             "stock_check", "carrier_choice", "decision", "client_message"]


@pytest.fixture
def desk(client):
    client.post("/api/desk/reset")
    yield client
    client.post("/api/desk/reset")


def _process(client, mid):
    r = client.post(f"/api/desk/process/{mid}")
    assert r.status_code == 200, r.text
    return r.json()


def _step(trace, key):
    return next(s for s in trace["steps"] if s["key"] == key)


# ---------------------------------------------------------------- inbox
def test_loader_loads_the_twelve_sample_emails(desk):
    msgs = desk.get("/api/desk/inbox").json()["messages"]
    assert [m["id"] for m in msgs] == [f"M{i:02d}" for i in range(1, 13)]
    m1 = msgs[0]
    assert m1["client_id"] == "C055" and m1["from_email"] == "purchasing@client-055.example"
    assert m1["received_at"] == "2026-10-22 07:20" and m1["status"] == "new" and m1["decision"] is None
    assert {"from_name", "subject", "scenario", "expected_decision", "what_it_demonstrates",
            "has_attachment"} <= set(m1)
    assert [m["id"] for m in msgs if m["has_attachment"]] == ["M12"]


def test_inbox_detail_has_body_and_attachment_text(desk):
    b = desk.get("/api/desk/inbox/M12").json()
    assert "PO-209-1147" in b["body"]
    att = b["attachments"][0]
    assert att["filename"] == "PO-209-1147.csv" and att["content_type"] == "text/csv"
    assert "HX-2040" in att["text"]
    assert desk.get("/api/desk/inbox/NOPE").status_code == 404


def test_received_time_is_warehouse_local():
    from app.desk.inbox import parse_eml

    raw = (b"From: a@client-003.example\nTo: o@h.example\nSubject: x\n"
           b"Date: Fri, 23 Oct 2026 12:10:00 +0000\n\nhello\n")
    msg = parse_eml(raw, "America/Chicago")
    assert msg["received_at"].strftime("%Y-%m-%d %H:%M") == "2026-10-23 07:10"


# ---------------------------------------------------------------- pipeline
@pytest.mark.parametrize("mid", sorted(EXPECTED))
def test_every_sample_email_meets_its_expected_decision_under_mock(desk, mid):
    t = _process(desk, mid)
    assert t["decision"] == EXPECTED[mid], (mid, t["decision_reason"])
    assert t["matches_expected"] is True and t["expected_decision"] == EXPECTED[mid]
    assert [s["key"] for s in t["steps"]] == STEP_KEYS
    assert [s["step"] for s in t["steps"]] == list(range(1, 11))
    for s in t["steps"]:
        assert s["actor"] in {"AI agent", "Rule", "Data lookup", "Guardrail"}
        assert s["status"] in {"pass", "warn", "fail", "skipped"}
        assert s["summary"] and isinstance(s["details"], dict) and s["duration_ms"] >= 0
    assert _step(t, "extract")["agent_name"] == "Order Intake Agent"
    assert t["llm_provider"] == "mock" and t["llm_model"] == "mock-fast"


def test_complete_order_is_ready_for_pick_list_with_a_confirmation_draft(desk):
    t = _process(desk, "M01")
    o = t["wms_order"]
    assert o["status"] == "ready_for_pick_list" and o["client_id"] == "C055"
    assert o["ship_to"]["city"] == "Hartford" and o["lines"] == [{"sku": "HX-1001", "qty": 12},
                                                                 {"sku": "HX-2040", "qty": 5}]
    assert o["commitment_type"] == "next_day" and o["pick_list_date"] == "2026-10-22"
    assert o["promised_date"] == "2026-10-24"
    ident = _step(t, "identify_client")["details"]
    assert ident["client_id"] == "C055" and ident["at_risk"] is True and ident["account_tier"] == "Tier 2"
    d = t["client_email_draft"]
    assert d["requires_approval"] is True and d["status"] == "draft" and "2026-10-24" in d["body"]


def test_missing_postcode_is_held_with_a_follow_up(desk):
    t = _process(desk, "M02")
    assert t["wms_order"]["status"] == "on_hold_missing_address"
    addr = _step(t, "address_check")
    assert addr["status"] == "fail" and addr["details"]["missing"] == ["postcode"]
    assert "postcode" in t["client_email_draft"]["body"].lower()
    assert _step(t, "stock_check")["status"] == "skipped"


def test_missing_street_is_held(desk):
    t = _process(desk, "M03")
    assert _step(t, "address_check")["details"]["missing"] == ["street"]


def test_same_day_after_cutoff_is_re_promised_next_day(desk):
    t = _process(desk, "M04")
    p = _step(t, "promise_check")
    assert p["status"] == "warn" and p["details"]["requested_commitment"] == "same_day"
    o = t["wms_order"]
    assert o["commitment_type"] == "next_day" and o["pick_list_date"] == "2026-10-24"
    assert o["promised_date"] == "2026-10-25"


def test_same_day_before_cutoff_keeps_same_day(desk):
    t = _process(desk, "M05")
    assert _step(t, "promise_check")["status"] == "pass"
    o = t["wms_order"]
    assert o["commitment_type"] == "same_day" and o["pick_list_date"] == "2026-10-23"


def test_table_layout_and_csv_attachment_lines_are_read(desk):
    assert len(_process(desk, "M07")["wms_order"]["lines"]) == 4
    t = _process(desk, "M12")
    assert t["wms_order"]["lines"] == [{"sku": "HX-2040", "qty": 36}, {"sku": "HX-6200", "qty": 4},
                                       {"sku": "HX-9001", "qty": 12}]


def test_west_order_ships_from_further_warehouse_when_nearest_has_no_stock(desk):
    t = _process(desk, "M08")
    s = _step(t, "stock_check")
    assert s["status"] == "warn"
    o = t["wms_order"]
    assert o["destination_region"] == "West" and o["nearest_warehouse_id"] == "W5"
    assert o["fulfilment_warehouse_id"] not in {None, "W5"}
    assert s["details"]["distance_miles"] > s["details"]["nearest_distance_miles"]


def test_southeast_order_avoids_the_spreadsheet_weak_lane(desk):
    t = _process(desk, "M09")
    c = _step(t, "carrier_choice")["details"]
    assert c["spreadsheet_pick"]["carrier_id"] == "F" and c["spreadsheet_pick"]["weak_lane"] is True
    assert c["advisor_pick"]["carrier_id"] != "F" and c["advisor_pick"]["weak_lane"] is False
    assert t["wms_order"]["carrier_id"] == c["advisor_pick"]["carrier_id"] and t["wms_order"]["carrier_reason"]


def test_advisor_never_picks_a_weak_lane(dataset):
    from app.analytics.causes import WEAK_CARRIER_LANES
    from app.desk.rules import choose_carrier

    for region in ["Midwest", "Northeast", "Southeast", "West"]:
        pick = choose_carrier(region)["advisor_pick"]
        assert (pick["carrier_id"], region) not in WEAK_CARRIER_LANES


def test_prompt_injection_is_blocked_before_the_model(desk):
    t = _process(desk, "M10")
    assert t["wms_order"] is None and t["client_email_draft"] is None
    assert _step(t, "guardrail")["status"] == "fail"
    assert all(s["status"] == "skipped" for s in t["steps"][2:])
    assert desk.get("/api/desk/wms-orders").json()["orders"] == []


def test_vague_quantity_needs_review(desk):
    t = _process(desk, "M11")
    assert t["wms_order"]["status"] == "needs_review"
    assert _step(t, "extract")["status"] == "warn"


def test_reprocessing_replaces_the_wms_order(desk):
    _process(desk, "M01")
    _process(desk, "M01")
    orders = desk.get("/api/desk/wms-orders").json()["orders"]
    assert len(orders) == 1 and orders[0]["message_id"] == "M01"
    assert isinstance(orders[0]["ship_to"], dict) and isinstance(orders[0]["lines"], list)
    msg = next(m for m in desk.get("/api/desk/inbox").json()["messages"] if m["id"] == "M01")
    assert msg["status"] == "processed" and msg["decision"] == "accepted"


def test_ai_steps_are_logged_to_agent_runs(desk):
    _process(desk, "M01")
    agents = [r["agent"] for r in desk.get("/api/agents/runs?limit=5").json()["runs"]]
    assert "order_desk.reply" in agents and "order_desk.extract" in agents


def test_process_all_matches_expected_and_reset_clears(desk):
    b = desk.post("/api/desk/process-all").json()
    assert b["processed"] == 12 and b["matches_expected"] == 12
    assert b["counts"] == {"accepted": 8, "on_hold": 2, "needs_review": 1, "blocked": 1}
    assert {r["message_id"] for r in b["results"]} == set(EXPECTED)
    assert len(desk.get("/api/desk/wms-orders").json()["orders"]) == 11
    assert desk.post("/api/desk/process-all").json()["processed"] == 0  # nothing new left
    desk.post("/api/desk/reset")
    assert desk.get("/api/desk/wms-orders").json()["orders"] == []
    assert all(m["status"] == "new" for m in desk.get("/api/desk/inbox").json()["messages"])


def test_unknown_message_is_404(desk):
    r = desk.post("/api/desk/process/NOPE")
    assert r.status_code == 404 and r.json()["error"]["code"] == "not_found"


def test_desk_posts_need_the_demo_token_when_set(desk, monkeypatch):
    from app.config import get_settings

    monkeypatch.setenv("DEMO_TOKEN", "s3cret")
    get_settings.cache_clear()
    try:
        assert desk.post("/api/desk/process/M01").status_code == 401
        assert desk.post("/api/desk/process/M01", headers={"X-Demo-Token": "s3cret"}).status_code == 200
    finally:
        get_settings.cache_clear()


def test_llm_failure_in_the_desk_is_a_502(desk, monkeypatch):
    from app.agents.llm_client import LLMClient, LLMError

    def boom(self, **kwargs):
        raise LLMError("model down")

    monkeypatch.setattr(LLMClient, "generate", boom)
    r = desk.post("/api/desk/process/M01")
    assert r.status_code == 502 and r.json()["error"]["code"] == "llm_error"
