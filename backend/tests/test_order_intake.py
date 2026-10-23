"""Mock-provider extraction + deterministic checks on sample emails."""
from conftest import SAMPLE_EMAILS


def _run(name):
    from app.agents.order_intake import parse_email_mock

    return parse_email_mock((SAMPLE_EMAILS / name).read_text())


def test_complete_address_email_extracts_everything():
    from app.agents.order_intake import run_checks

    ext = _run("01_complete_next_day.txt")
    assert ext.client_name == "Client 042"
    assert [(i.sku, i.qty) for i in ext.items] == [("HX-1001", 12), ("HX-2040", 5)]
    assert ext.ship_to.city == "Columbus" and ext.ship_to.state == "OH"
    assert ext.ship_to.postcode == "43215" and ext.ship_to.country == "US"
    assert ext.commitment_type == "next_day"
    assert ext.requested_date == "2026-10-24"
    checks = run_checks(ext)
    assert checks["address_status"] == "complete"
    assert checks["follow_up_email"] is None
    assert checks["cutoff"]["after_cutoff"] is False


def test_incomplete_address_email_gets_follow_up():
    from app.agents.order_intake import run_checks

    ext = _run("02_incomplete_address.txt")
    checks = run_checks(ext)
    assert checks["address_status"] == "incomplete"
    assert "postcode" in checks["missing_address_fields"]
    assert "street" in checks["missing_address_fields"]
    assert "postcode" in checks["follow_up_email"]["body"].lower()
    assert ext.client_name in checks["follow_up_email"]["body"]


def test_same_day_after_cutoff_warns_and_suggests_next_day():
    from app.agents.order_intake import run_checks

    ext = _run("03_same_day_after_cutoff.txt")
    assert ext.commitment_type == "same_day"
    assert ext.received_at == "2026-10-23 09:40"
    checks = run_checks(ext)
    assert checks["cutoff"]["after_cutoff"] is True
    assert checks["cutoff"]["suggested_commitment_type"] == "next_day"
    assert any("08:00" in w for w in checks["warnings"])


def test_same_day_before_cutoff_is_fine():
    from app.agents.order_intake import run_checks

    ext = _run("04_same_day_before_cutoff.txt")
    checks = run_checks(ext)
    assert ext.commitment_type == "same_day"
    assert checks["cutoff"]["after_cutoff"] is False
    assert checks["address_status"] == "complete"


def test_missing_country_defaults_to_us_and_is_recorded_as_assumption():
    from app.agents.order_intake import parse_email_mock, run_checks

    ext = parse_email_mock("Client: Client 007\nSKU HX-1 x 3\nName: Dock 2\nStreet: 1 Elm St\nCity: Austin\n"
                           "State: TX\nPostcode: 73301\nNext day please.")
    assert ext.ship_to.country is None
    checks = run_checks(ext)
    assert checks["address_status"] == "complete"
    assert "country" not in checks["missing_address_fields"]
    assert ext.ship_to.country == "US"
    assert any("assumed US" in a for a in checks["assumptions"])


def test_free_text_one_line_address_is_parsed():
    from app.agents.order_intake import parse_email_mock, run_checks

    ext = parse_email_mock("Hi, please send 4 x SKU HX-7 to 500 Main St, Dallas TX 75201 tomorrow. Thanks")
    s = ext.ship_to
    assert (s.street, s.city, s.state, s.postcode) == ("500 Main St", "Dallas", "TX", "75201")
    assert run_checks(ext)["missing_address_fields"] == ["name"]


def test_labelled_one_line_address_with_name_and_country():
    ext = _run("05_one_line_address.txt")
    s = ext.ship_to
    assert (s.name, s.street, s.city, s.state, s.postcode, s.country) == (
        "Client 150 Receiving", "77 Pine Avenue", "Denver", "CO", "80202", "US")


def test_cutoff_uses_request_time_first():
    from app.agents.order_intake import parse_email_mock, run_checks

    ext = parse_email_mock("Same-day please. SKU HX-1 x 1")
    cutoff = run_checks(ext, "2026-10-23 07:59")["cutoff"]
    assert cutoff["received_at_source"] == "request" and cutoff["after_cutoff"] is False


def test_cutoff_falls_back_to_warehouse_local_clock(monkeypatch):
    from datetime import datetime
    from zoneinfo import ZoneInfo

    from app.agents.order_intake import parse_email_mock, run_checks
    from app.config import get_settings

    monkeypatch.setenv("WAREHOUSE_TZ", "Asia/Kolkata")
    get_settings.cache_clear()
    try:
        checks = run_checks(parse_email_mock("Same-day please. SKU HX-1 x 1"))
    finally:
        monkeypatch.delenv("WAREHOUSE_TZ")
        get_settings.cache_clear()
    cutoff = checks["cutoff"]
    assert cutoff["received_at_source"] == "warehouse_clock" and cutoff["timezone"] == "Asia/Kolkata"
    now = datetime.now(ZoneInfo("Asia/Kolkata"))
    got = datetime.strptime(cutoff["received_at"], "%Y-%m-%d %H:%M").replace(tzinfo=ZoneInfo("Asia/Kolkata"))
    assert abs((now - got).total_seconds()) < 120
    assert any("Asia/Kolkata" in a for a in checks["assumptions"])


def test_warehouse_timezone_defaults_to_chicago():
    from app.agents.order_intake import parse_email_mock, run_checks

    cutoff = run_checks(parse_email_mock("SKU HX-1 x 1"))["cutoff"]
    assert cutoff["timezone"] == "America/Chicago"
