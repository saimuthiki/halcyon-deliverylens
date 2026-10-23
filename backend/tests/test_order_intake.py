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
