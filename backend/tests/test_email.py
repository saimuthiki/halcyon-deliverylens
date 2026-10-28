"""The shared email module: messages, backends, the service, templates and the Weekly Brief on top of them.

No test sends a real email: SNS is a fake client, everything else uses the memory or console backend.
"""
import json
import logging
from dataclasses import replace

import pytest

from app.agents.llm_client import LLMResponse
from app.config import get_settings
from app.email import (Attachment, EmailConfigError, EmailDeliveryError, EmailMessage, EmailValidationError,
                       get_backend, render_email, send_email)
from app.email import service
from app.email.backends import ConsoleBackend, SnsBackend
from app.email.service import MEMORY

TO, CC, BCC = "ops@example.com", "cfo@example.com", "audit@example.com"


def settings(**kw):
    return replace(get_settings(), **kw)


@pytest.fixture(autouse=True)
def _empty_outbox():
    MEMORY.clear()
    yield
    MEMORY.clear()


class FakeSns:
    def __init__(self):
        self.published = []

    def publish(self, **kw):
        self.published.append(kw)
        return {"MessageId": "sns-1"}


# ---------------------------------------------------------------- message
def test_addresses_are_normalised_and_never_duplicated():
    m = EmailMessage(subject="Hi", text_body="x", to=f"{TO}, {CC}", cc=[CC.upper(), BCC], bcc=[TO, BCC, "x@example.com"])
    assert m.to == (TO, CC) and m.cc == (BCC,) and m.bcc == ("x@example.com",)
    assert m.recipients() == (TO, CC, BCC, "x@example.com")


@pytest.mark.parametrize("kw, error", [
    ({"subject": " "}, "subject is empty"),
    ({"subject": "Hi\r\nBcc: evil@example.com"}, "line break"),
    ({"text_body": None, "html_body": " "}, "no body"),
    ({"to": ("not-an-address",)}, "valid email address in to"),
    ({"cc": ("a@b",)}, "valid email address in cc"),
    ({"to": ()}, "no To recipient"),
    ({"from_email": "nobody"}, "sender address"),
    ({"from_name": "Ops\nBcc: x"}, "sender name"),
    ({"attachments": (Attachment("../x.csv", b"1", "text/csv"),)}, "unsafe file name"),
    ({"attachments": (Attachment("x.csv", b"1", "csv"),)}, "MIME type"),
    ({"attachments": (Attachment("x.bin", b"0" * (10 * 1024 * 1024 + 1)),)}, "exceed"),
])
def test_validation_rejects_bad_messages(kw, error):
    base = {"subject": "Hi", "text_body": "x", "to": (TO,)}
    with pytest.raises(EmailValidationError, match=error):
        EmailMessage(**{**base, **kw}).validate()


def test_sender_is_required_only_when_asked():
    m = EmailMessage(subject="Hi", text_body="x", to=(TO,))
    m.validate()
    with pytest.raises(EmailValidationError, match="EMAIL_FROM_ADDRESS"):
        m.validate(require_sender=True)


def test_bcc_is_never_written_into_the_headers():
    m = EmailMessage(subject="Hi", text_body="x", html_body="<p>x</p>", to=(TO,), cc=(CC,), bcc=(BCC,),
                     from_email="brief@example.com", from_name="DeliveryLens", reply_to=("team@example.com",))
    mime = m.to_mime()
    raw = mime.as_string()
    assert mime["To"] == TO and mime["Cc"] == CC and mime["Reply-To"] == "team@example.com"
    assert mime["Bcc"] is None and BCC not in raw
    assert mime["From"] == "DeliveryLens <brief@example.com>"
    assert BCC in m.recipients()


def test_mime_carries_text_html_and_attachments():
    m = EmailMessage(subject="Claims", text_body="plain", html_body="<p>rich</p>", to=(TO,),
                     from_email="brief@example.com", attachments=(Attachment("claims.csv", b"a,b\n1,2\n", "text/csv"),))
    mime = m.to_mime()
    parts = [p.get_content_type() for p in mime.walk()]
    assert {"text/plain", "text/html", "text/csv"} <= set(parts)
    assert [p.get_filename() for p in mime.iter_attachments()] == ["claims.csv"]


# ---------------------------------------------------------------- backends and selection
def test_backend_selection():
    assert isinstance(get_backend(settings(email_backend="sns"), sns_topic_arn="arn:t", sns_client_factory=FakeSns),
                      SnsBackend)
    assert isinstance(get_backend(settings(email_backend="console")), ConsoleBackend)
    assert get_backend(settings(email_backend="memory")) is MEMORY
    with pytest.raises(EmailConfigError, match="topic ARN"):
        get_backend(settings(email_backend="sns"))
    with pytest.raises(EmailConfigError, match="not available yet"):
        get_backend(settings(email_backend="smtp"))
    with pytest.raises(EmailConfigError, match="Unknown EMAIL_BACKEND"):
        get_backend(settings(email_backend="pigeon"))


def test_sns_backend_matches_the_previous_publish_call():
    sns = FakeSns()
    backend = SnsBackend("arn:topic", lambda: sns)
    m = EmailMessage(subject="S" * 120, text_body="the body", html_body="<p>ignored</p>", to=(TO,), cc=(CC,))
    result = send_email(m, backend=backend, settings=settings(email_backend="sns"))
    assert sns.published == [{"TopicArn": "arn:topic", "Subject": "S" * 100, "Message": "the body"}]
    assert result.provider == "sns" and result.message_id == "sns-1" and result.recipients == 0


def test_sns_backend_refuses_what_sns_cannot_send():
    backend = SnsBackend("arn:topic", FakeSns)
    with pytest.raises(EmailValidationError, match="attachments"):
        backend.send(EmailMessage(subject="S", text_body="x", attachments=(Attachment("a.txt", b"x", "text/plain"),)))
    with pytest.raises(EmailValidationError, match="plain-text"):
        backend.send(EmailMessage(subject="S", html_body="<p>x</p>"))


def test_sns_ignores_test_mode_because_the_topic_chooses_recipients():
    sns = FakeSns()
    s = settings(email_backend="sns", email_test_mode=True, email_test_recipients=())
    send_email(EmailMessage(subject="S", text_body="x"), backend=SnsBackend("arn:t", lambda: sns), settings=s)
    assert sns.published[0]["Subject"] == "S"


# ---------------------------------------------------------------- service: sender, test mode, errors
def test_sender_and_reply_to_come_from_settings():
    s = settings(email_backend="memory", email_test_mode=False, email_from_address="brief@example.com",
                 email_from_name="Halcyon DeliveryLens", email_reply_to=("team@example.com",))
    send_email(EmailMessage(subject="Hi", text_body="x", to=(TO,), bcc=(BCC,)), settings=s)
    sent = MEMORY.outbox[-1]
    assert sent["mime"]["From"] == "Halcyon DeliveryLens <brief@example.com>"
    assert sent["mime"]["Reply-To"] == "team@example.com"
    assert sent["envelope"] == [TO, BCC] and sent["mime"]["Bcc"] is None


def test_test_mode_sends_only_to_the_test_recipients():
    s = settings(email_backend="memory", email_test_mode=True, email_from_address="brief@example.com",
                 email_test_recipients=("qa1@example.com", "qa2@example.com"))
    send_email(EmailMessage(subject="Brief", text_body="x", to=(TO,), cc=(CC,), bcc=(BCC,)), settings=s)
    sent = MEMORY.outbox[-1]
    assert sent["envelope"] == ["qa1@example.com", "qa2@example.com"]
    assert sent["mime"]["Subject"] == "[TEST] Brief" and sent["mime"]["Cc"] is None
    assert not {TO, CC, BCC} & set(sent["mime"].as_string().split())


def test_test_mode_without_test_recipients_sends_nothing():
    s = settings(email_backend="memory", email_test_mode=True, email_test_recipients=(),
                 email_from_address="brief@example.com")
    with pytest.raises(EmailConfigError, match="EMAIL_TEST_RECIPIENTS"):
        send_email(EmailMessage(subject="Hi", text_body="x", to=(TO,)), settings=s)
    assert MEMORY.outbox == []


def test_provider_failure_is_wrapped_and_logged_without_content(caplog):
    class Broken:
        name, addresses_recipients, requires_sender = "broken", True, False

        def send(self, message):
            raise ConnectionError("smtp down")

    s = settings(email_test_mode=False)
    with caplog.at_level(logging.INFO, logger="app.email.service"), pytest.raises(EmailDeliveryError) as e:
        send_email(EmailMessage(subject="Secret subject", text_body="secret body", to=(TO,)), backend=Broken(), settings=s)
    assert isinstance(e.value.__cause__, ConnectionError)
    record = json.loads(caplog.records[-1].getMessage())
    assert record["event"] == "email_failed" and record["error"] == "ConnectionError" and record["to"] == 1
    assert not any(x in caplog.text for x in ("Secret subject", "secret body", TO))


def test_sent_email_is_logged_with_counts_only(caplog):
    s = settings(email_backend="memory", email_test_mode=False, email_from_address="brief@example.com")
    with caplog.at_level(logging.INFO, logger="app.email.service"):
        send_email(EmailMessage(subject="Hi", text_body="x", to=(TO,), cc=(CC,), category="weekly_brief"), settings=s)
    record = json.loads(caplog.records[-1].getMessage())
    assert record["event"] == "email_sent" and record["category"] == "weekly_brief"
    assert (record["to"], record["cc"], record["bcc"]) == (1, 1, 0) and TO not in caplog.text


# ---------------------------------------------------------------- configuration
def test_email_settings_from_the_environment(monkeypatch):
    env = {"EMAIL_BACKEND": "Console", "EMAIL_FROM_ADDRESS": "brief@example.com", "EMAIL_TEST_MODE": "false",
           "EMAIL_TEST_RECIPIENTS": "qa1@example.com, qa2@example.com", "WEEKLY_BRIEF_TO": f"{TO},{CC}",
           "WEEKLY_BRIEF_BCC": BCC, "SMTP_PORT": "465", "SMTP_SECURITY": "SSL", "SMTP_PASSWORD": "not-a-real-key"}
    for k, v in env.items():
        monkeypatch.setenv(k, v)
    get_settings.cache_clear()
    try:
        s = get_settings()
        assert s.email_backend == "console" and s.email_from_address == "brief@example.com"
        assert s.email_test_mode is False and s.email_test_recipients == ("qa1@example.com", "qa2@example.com")
        assert s.weekly_brief_to == (TO, CC) and s.weekly_brief_bcc == (BCC,) and s.weekly_brief_cc == ()
        assert (s.smtp_port, s.smtp_security) == (465, "ssl")
        assert "not-a-real-key" not in repr(s)
    finally:
        get_settings.cache_clear()


def test_email_defaults_keep_sns_and_test_mode():
    s = get_settings()
    assert s.email_backend == "sns" and s.email_test_mode is True and s.email_from_name == "DeliveryLens"


# ---------------------------------------------------------------- templates and the Weekly Brief
class FakeLLM:
    def __init__(self, reply: dict):
        self.reply = reply

    def generate(self, **_):
        return LLMResponse(text=json.dumps(self.reply), provider="fake", model="fake")


def test_ai_text_is_escaped_in_html_and_plain_in_text(dataset):
    from app.agents.weekly_brief import run_weekly_brief

    r = run_weekly_brief(dataset, llm=FakeLLM({"headline": "On time <b>up</b> & <script>alert(1)</script>",
                                               "commentary": "Carriers improved."}))
    html, text = r["brief"]["html"], r["brief"]["body"]
    assert "<script>" not in html and "&lt;script&gt;" in html and "&amp;" in html
    assert text.startswith("On time <b>up</b> & <script>alert(1)</script>") and "<table" not in text
    assert r["guardrail_flags"] == []


def test_invented_numbers_send_the_ai_text_back_to_the_template(dataset):
    from app.agents.weekly_brief import _template, brief_facts, run_weekly_brief

    r = run_weekly_brief(dataset, llm=FakeLLM({"headline": "On time hit 99.9% this week", "commentary": "Great."}))
    assert "unverified_numbers_used_template" in r["guardrail_flags"] and r["unverified_numbers"] == ["99.9%"]
    t = _template(brief_facts(dataset))
    assert r["brief"]["headline"] == t["headline"] and r["brief"]["commentary"] == t["commentary"]


def test_ai_reply_without_the_two_fields_uses_the_template(dataset):
    from app.agents.weekly_brief import run_weekly_brief

    r = run_weekly_brief(dataset, llm=FakeLLM({"subject": "x", "body": "old shape"}))
    assert "llm_output_not_json_used_template" in r["guardrail_flags"]


def test_brief_tables_come_from_the_facts(dataset):
    from app.agents.weekly_brief import run_weekly_brief

    r = run_weekly_brief(dataset)
    f, html, text = r["facts"], r["brief"]["html"], r["brief"]["body"]
    for c in f["main_causes"]:
        assert c["label"] in html and c["label"] in text
    for t in f["trend"]:
        assert t["week_of"] in html and t["week_of"] in text
    for a in f["top_actions"]:
        assert a["owner"] in html and a["owner"] in text
    assert f"carrier {f['worst_lane']['carrier_id']} to the {f['worst_lane']['region']}" in html
    assert f"${f['at_risk_clients']['annual_revenue_usd']:,}" in html
    assert len(f["trend"]) == 6 and r["brief"]["subject"] in html  # <title>


def test_the_first_week_renders_without_a_previous_week(dataset):
    from app.agents.weekly_brief import available_weeks, run_weekly_brief

    r = run_weekly_brief(dataset, available_weeks(dataset)[0])
    assert r["facts"]["change_points"] is None and "first week in the data" in r["brief"]["html"]


def test_a_missing_fact_fails_loudly_instead_of_rendering_a_blank():
    from jinja2 import UndefinedError

    with pytest.raises(UndefinedError):
        render_email("weekly_brief", {"f": {"week_of": "2026-09-21"}, "subject": "s",
                                      "brief": {"headline": "h", "commentary": "c"}})


def test_weekly_brief_through_the_memory_backend(dataset, monkeypatch):
    from app.agents import weekly_brief as wb

    s = settings(email_backend="memory", email_test_mode=False, email_from_address="brief@example.com",
                 weekly_brief_to=(TO,), weekly_brief_cc=(CC,), weekly_brief_bcc=(BCC,))
    monkeypatch.setattr(service, "get_settings", lambda: s)
    monkeypatch.setattr(wb, "_last_sent", 0.0)
    r = wb.run_weekly_brief(dataset)
    assert r["delivery"] == {"configured": True, "backend": "memory", "recipients": {"to": 1, "cc": 1, "bcc": 1},
                             "test_mode": False, "schedule": wb.SCHEDULE}
    out = wb.send_brief(r)
    assert out["backend"] == "memory" and out["sent"]
    sent = MEMORY.outbox[-1]
    assert sent["envelope"] == [TO, CC, BCC] and sent["mime"]["Bcc"] is None
    assert sent["message"].html_body == r["brief"]["html"] and sent["message"].text_body == r["brief"]["body"]
    with pytest.raises(wb.TooSoon):  # the cooldown still applies
        wb.send_brief(r)


def test_weekly_brief_not_configured_without_recipients(dataset, monkeypatch):
    from app.agents import weekly_brief as wb

    s = settings(email_backend="memory", email_test_mode=False, weekly_brief_to=())
    monkeypatch.setattr(service, "get_settings", lambda: s)
    with pytest.raises(wb.NotConfigured, match="WEEKLY_BRIEF_TO is empty"):
        wb.send_brief(wb.run_weekly_brief(dataset))
    assert MEMORY.outbox == []
    monkeypatch.setattr(service, "get_settings", lambda: replace(s, email_backend="smtp"))
    status = wb.delivery_status()
    assert status["configured"] is False and "not available yet" in status["note"]


# ---------------------------------------------------------------- Brevo (HTTP API) and the link to the web page
class FakeBrevoResponse:
    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def read(self):
        return b'{"messageId": "<brevo-1>"}'


def test_brevo_needs_a_key():
    with pytest.raises(EmailConfigError, match="BREVO_API_KEY"):
        get_backend(settings(email_backend="brevo", brevo_api_key=""))


def test_weekly_brief_through_brevo_sends_html_in_test_mode(dataset, monkeypatch):
    from app.agents import weekly_brief as wb
    from app.email import backends

    calls = []

    def fake_urlopen(req, timeout):
        calls.append({"url": req.full_url, "key": req.get_header("Api-key"), "body": json.loads(req.data)})
        return FakeBrevoResponse()

    s = settings(email_backend="brevo", brevo_api_key="k", email_from_address="brief@team.example",
                 email_test_mode=True, email_test_recipients=(TO,), weekly_brief_to=(CC,), weekly_brief_bcc=(BCC,))
    monkeypatch.setattr(service, "get_settings", lambda: s)
    monkeypatch.setattr(backends.urllib.request, "urlopen", fake_urlopen)
    monkeypatch.setattr(wb, "_last_sent", 0.0)
    r = wb.run_weekly_brief(dataset)
    assert r["delivery"]["configured"] and r["delivery"]["backend"] == "brevo"
    out = wb.send_brief(r)
    assert out["backend"] == "brevo" and out["message_id"] == "<brevo-1>"
    body = calls[0]["body"]
    assert calls[0]["url"] == backends.BrevoBackend.URL and calls[0]["key"] == "k"
    assert body["to"] == [{"email": TO}] and "bcc" not in body and body["subject"].startswith("[TEST] ")
    assert body["sender"]["email"] == "brief@team.example" and "<table" in body["htmlContent"]


def test_brief_links_to_its_week_on_the_website(dataset):
    from app.agents.weekly_brief import run_weekly_brief

    r = run_weekly_brief(dataset)
    url = f"{get_settings().public_site_url}/weekly-brief?week={r['week_of']}"
    assert url in r["brief"]["body"] and url in r["brief"]["html"]
