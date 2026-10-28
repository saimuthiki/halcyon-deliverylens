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
def test_loader_loads_the_eleven_sample_emails(desk):
    msgs = desk.get("/api/desk/inbox").json()["messages"]
    assert [m["id"] for m in msgs] == ["M01", "M02", "M05", "M08", "M09", "M10", "M11", "M12", "M13", "M14", "M17"]
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


def test_complete_order_waits_for_approval_with_a_confirmation_draft(desk):
    t = _process(desk, "M01")
    o = t["wms_order"]
    assert t["decision"] == "accepted"
    assert o["status"] == "awaiting_approval" and o["client_id"] == "C055" and o["approved_at"] is None
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
    # "warn", not "fail": the postcode was found in the client's history and waits for their confirmation
    assert addr["status"] == "warn" and addr["details"]["missing"] == ["postcode"]
    assert "postcode" in t["client_email_draft"]["body"].lower()
    assert _step(t, "stock_check")["status"] == "skipped"


def test_same_day_before_cutoff_keeps_same_day(desk):
    t = _process(desk, "M05")
    assert _step(t, "promise_check")["status"] == "pass"
    o = t["wms_order"]
    assert o["commitment_type"] == "same_day" and o["pick_list_date"] == "2026-10-23"


def test_csv_attachment_lines_are_read(desk):
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
    assert b["processed"] == 11 and b["matches_expected"] == 11
    assert b["counts"] == {"accepted": 8, "on_hold": 1, "needs_review": 1, "blocked": 1}
    assert {r["message_id"] for r in b["results"]} == set(EXPECTED)
    assert len(desk.get("/api/desk/wms-orders").json()["orders"]) == 10
    assert desk.post("/api/desk/process-all").json()["processed"] == 0  # nothing new left
    desk.post("/api/desk/reset")
    assert desk.get("/api/desk/wms-orders").json()["orders"] == []
    assert all(m["status"] == "new" for m in desk.get("/api/desk/inbox").json()["messages"])


# ---------------------------------------------------------------- human approval before the WMS
def test_accepted_decision_step_says_a_person_must_approve(desk):
    d = _step(_process(desk, "M01"), "decision")
    assert d["actor"] == "Rule" and d["details"]["wms_status"] == "awaiting_approval"
    assert d["summary"].startswith("Accepted: waiting for a person to approve it into the WMS")


def test_approve_moves_an_accepted_order_to_the_pick_list(desk):
    _process(desk, "M01")
    r = desk.post("/api/desk/approve/M01")
    assert r.status_code == 200, r.text
    o = r.json()["wms_order"]
    assert o["status"] == "ready_for_pick_list" and o["approved_at"]
    assert o["promised_date"] == "2026-10-24" and o["pick_list_date"] == "2026-10-22"  # plan unchanged
    listed = desk.get("/api/desk/wms-orders").json()["orders"]
    assert listed[0]["status"] == "ready_for_pick_list" and listed[0]["approved_at"]


def test_approving_twice_is_a_409(desk):
    _process(desk, "M01")
    assert desk.post("/api/desk/approve/M01").status_code == 200
    r = desk.post("/api/desk/approve/M01")
    assert r.status_code == 409


def test_re_processing_an_approved_order_is_a_409_and_keeps_the_approval(desk):
    _process(desk, "M01")
    assert desk.post("/api/desk/approve/M01").status_code == 200
    r = desk.post("/api/desk/process/M01")
    assert r.status_code == 409
    assert "Already approved into the WMS; reset the demo to run it again" in r.text
    o = desk.get("/api/desk/wms-orders").json()["orders"][0]
    assert o["status"] == "ready_for_pick_list" and o["approved_at"]


def test_process_all_skips_a_message_whose_order_is_already_approved(desk):
    from sqlalchemy import update

    from app.db import get_session
    from app.models import InboxMessage

    _process(desk, "M01")
    assert desk.post("/api/desk/approve/M01").status_code == 200
    with get_session() as s:  # e.g. a message re-queued while its order stays approved
        s.execute(update(InboxMessage).where(InboxMessage.id == "M01").values(status="new"))
        s.commit()
    b = desk.post("/api/desk/process-all").json()
    assert "M01" not in {x["message_id"] for x in b["results"]}
    o = next(o for o in desk.get("/api/desk/wms-orders").json()["orders"] if o["message_id"] == "M01")
    assert o["status"] == "ready_for_pick_list" and o["approved_at"]


def test_on_hold_order_cannot_be_approved(desk):
    _process(desk, "M02")
    assert desk.post("/api/desk/approve/M02").status_code == 409


def test_approve_unknown_or_unprocessed_is_404(desk):
    assert desk.post("/api/desk/approve/NOPE").status_code == 404
    assert desk.post("/api/desk/approve/M01").status_code == 404  # not processed yet: no WMS order


def test_approve_all_approves_every_awaiting_order_only(desk):
    desk.post("/api/desk/process-all")
    r = desk.post("/api/desk/approve-all")
    assert r.status_code == 200, r.text
    assert r.json()["approved"] == 8 and len(r.json()["wms_order_ids"]) == 8
    statuses = sorted(o["status"] for o in desk.get("/api/desk/wms-orders").json()["orders"])
    assert statuses.count("ready_for_pick_list") == 8 and "awaiting_approval" not in statuses
    assert desk.post("/api/desk/approve-all").json()["approved"] == 0


def test_approve_needs_the_demo_token_when_set(desk, monkeypatch):
    from app.config import get_settings

    _process(desk, "M01")
    monkeypatch.setenv("DEMO_TOKEN", "s3cret")
    get_settings.cache_clear()
    try:
        assert desk.post("/api/desk/approve/M01").status_code == 401
        assert desk.post("/api/desk/approve-all").status_code == 401
    finally:
        get_settings.cache_clear()


def test_init_db_adds_the_approved_at_column_to_an_old_wms_table(tmp_path):
    from sqlalchemy import create_engine, inspect, text

    from app.db import ensure_columns

    eng = create_engine(f"sqlite:///{tmp_path / 'old.db'}")
    with eng.begin() as c:
        c.execute(text("CREATE TABLE wms_orders (wms_order_id VARCHAR(30) PRIMARY KEY, status VARCHAR(30))"))
    ensure_columns(eng)
    ensure_columns(eng)  # idempotent
    assert "approved_at" in {col["name"] for col in inspect(eng).get_columns("wms_orders")}


def test_add_column_sql_per_dialect():
    from app.db import add_column_sql

    assert add_column_sql("postgresql", "wms_orders", "approved_at") ==         "ALTER TABLE wms_orders ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE"
    assert add_column_sql("sqlite", "wms_orders", "approved_at") ==         "ALTER TABLE wms_orders ADD COLUMN approved_at TIMESTAMP"


def test_ensure_columns_tolerates_a_column_added_concurrently(tmp_path, monkeypatch):
    """Another process adds the column between our inspect and our ALTER: no crash."""
    from sqlalchemy import create_engine, inspect, text

    import app.db as db

    eng = create_engine(f"sqlite:///{tmp_path / 'race.db'}")
    with eng.begin() as c:
        c.execute(text("CREATE TABLE wms_orders (wms_order_id VARCHAR(30) PRIMARY KEY, approved_at TIMESTAMP)"))
    real = db.inspect
    calls = []

    class Stale:  # the first inspection does not see approved_at yet
        def __init__(self, insp):
            self._insp = insp

        def has_table(self, t):
            return self._insp.has_table(t)

        def get_columns(self, t):
            return [c for c in self._insp.get_columns(t) if c["name"] != "approved_at"]

    def fake_inspect(e):
        calls.append(1)
        return Stale(real(e)) if len(calls) == 1 else real(e)

    monkeypatch.setattr(db, "inspect", fake_inspect)
    db.ensure_columns(eng)
    assert "approved_at" in {col["name"] for col in inspect(eng).get_columns("wms_orders")}


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


# ---------------------------------------------------------------- same-day orders after 08:00
RULE_KEYS = {"grace_until", "hard_stop", "window", "window_label", "added_after_cutoff", "same_day_rule",
             "priority_client", "urgency", "urgency_evidence"}


def _promise(desk, mid):
    t = _process(desk, mid)
    assert t["decision"] == "accepted"
    p = _step(t, "promise_check")
    assert RULE_KEYS <= set(p["details"])
    return t, p, p["details"]


def test_valid_reason_in_the_urgent_window_is_added_to_today(desk):
    t, p, d = _promise(desk, "M13")
    assert d["grace_until"] == "09:00" and d["hard_stop"] == "10:00" and d["window"] == "urgent_window"
    assert d["added_after_cutoff"] is True and d["urgency"] == "high"
    assert d["urgency_evidence"] == "Our production line stops at 3pm without these parts."
    assert p["status"] == "pass" and "today's pick list" in p["summary"]
    o = t["wms_order"]
    assert o["client_id"] == "C076" and o["commitment_type"] == "same_day" and o["pick_list_date"] == "2026-10-23"
    assert o["promised_date"] == "2026-10-24"
    body = t["client_email_draft"]["body"]
    assert "added it to today's pick list" in body and "next-day" not in body
    ext = _step(t, "extract")["details"]
    assert ext["urgency"] == "high" and ext["urgency_evidence"] == d["urgency_evidence"]


def test_shouting_urgent_from_an_ordinary_client_goes_to_tomorrow(desk):
    t, p, d = _promise(desk, "M14")
    assert d["urgency"] == "medium" and d["priority_client"] is None and d["added_after_cutoff"] is False
    assert p["status"] == "warn" and "next-day" in p["summary"]
    o = t["wms_order"]
    assert o["client_id"] == "C018" and o["commitment_type"] == "next_day" and o["pick_list_date"] == "2026-10-24"
    assert "next-day" in t["client_email_draft"]["body"]


def test_hard_stop_beats_even_a_valid_reason_from_an_at_risk_client(desk):
    t, p, d = _promise(desk, "M17")
    assert d["window"] == "after_hard_stop" and d["urgency"] == "high" and d["priority_client"]
    assert d["added_after_cutoff"] is False and p["status"] == "warn"
    assert t["wms_order"]["commitment_type"] == "next_day" and t["wms_order"]["pick_list_date"] == "2026-10-24"


def test_before_cutoff_order_needs_no_same_day_rule(desk):
    d = _step(_process(desk, "M05"), "promise_check")["details"]
    assert d["window"] == "before_cutoff" and d["added_after_cutoff"] is False and d["same_day_rule"] is None


def test_times_come_from_the_settings(desk, monkeypatch):
    from app.config import get_settings

    monkeypatch.setenv("SAME_DAY_GRACE_UNTIL", "10:00")
    monkeypatch.setenv("SAME_DAY_HARD_STOP", "10:30")
    get_settings.cache_clear()
    try:
        t, p, d = _promise(desk, "M14")  # 09:15 is now inside the grace period
        assert d["window"] == "grace" and d["added_after_cutoff"] is True
    finally:
        monkeypatch.undo()
        get_settings.cache_clear()


def test_unverified_urgency_quote_is_dropped(desk, monkeypatch):
    """The model claims a quote that is not in the email: urgency falls back to none, by code."""
    from app.agents.llm_client import LLMClient
    from app.desk.pipeline import parse_desk_mock

    real = LLMClient.generate

    def fake(self, **kw):
        if kw["agent"].endswith(".extract"):
            text = kw["prompt"]
            ext = parse_desk_mock(text).model_copy(update={"urgency": "high",
                                                           "urgency_evidence": "The plant shuts down at noon."})
            kw = dict(kw, mock=lambda: ext.model_dump_json())
        return real(self, **kw)

    monkeypatch.setattr(LLMClient, "generate", fake)
    t = _process(desk, "M14")
    ext = _step(t, "extract")["details"]
    assert ext["urgency"] == "none" and ext["urgency_evidence"] is None and ext["urgency_note"]
    d = _step(t, "promise_check")["details"]
    assert d["urgency"] == "none" and d["added_after_cutoff"] is False
