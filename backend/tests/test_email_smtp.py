"""The SMTP backend and durable duplicate-send protection. Fake SMTP connections only: real network connections
are disabled in this module, so no test can reach a mail server."""
import json
import logging
import smtplib
import socket
import ssl
from dataclasses import replace
from datetime import datetime, timedelta, timezone

import pytest

from app.config import get_settings
from app.email import AlreadySent, EmailConfigError, EmailDeliveryError, EmailMessage, SmtpBackend, send_email
from app.email import dedupe, service
from app.email.backends import SmtpError
from app.email.service import MEMORY

TO, CC, BCC = "ops@example.com", "cfo@example.com", "audit@example.com"
USER, PASSWORD = "smtp-user-placeholder", "smtp-password-placeholder"  # not real credentials
CTX = object()  # stands in for the verified TLS context


@pytest.fixture(autouse=True)
def _no_network(monkeypatch):
    def refuse(*a, **k):
        raise AssertionError("tests must not open network connections")
    monkeypatch.setattr(socket, "create_connection", refuse)
    MEMORY.clear()
    yield
    MEMORY.clear()


class Clock:
    def __init__(self):
        self.t = 0.0

    def __call__(self):
        return self.t


class FakeConn:
    def __init__(self, server, host, port, timeout=None, context=None):
        self.server, self.host, self.port, self.timeout, self.context = server, host, port, timeout, context
        self.plan = server.plans.pop(0) if server.plans else {}
        self.calls, self.rcpts, self.data_bytes = [], [], None
        server.conns.append(self)
        server.clock.t += server.attempt_seconds
        self._step("connect")

    def _step(self, stage):
        self.calls.append(stage)
        if stage in self.plan:
            raise self.plan[stage]

    def set_debuglevel(self, n):
        self.debuglevel = n

    def ehlo(self):
        self._step("ehlo")
        return 250, b"ok"

    def has_extn(self, name):
        return self.plan.get("starttls_offered", True) if name == "starttls" else False

    def starttls(self, context=None):
        self.starttls_context = context
        self._step("starttls")
        return 220, b"ready"

    def login(self, user, password):
        self.login_args = (user, password)
        self._step("login")
        return 235, b"ok"

    def mail(self, sender):
        self.sender = sender
        self._step("mail")
        return self.plan.get("mail_reply", (250, b"ok"))

    def rcpt(self, r):
        self.rcpts.append(r)
        self._step("rcpt")
        return self.plan.get("rcpt_replies", {}).get(r, (250, b"ok"))

    def data(self, msg):
        self.data_bytes = msg
        self._step("data")
        return 250, b"queued"

    def rset(self):
        self.calls.append("rset")

    def quit(self):
        self._step("quit")

    def close(self):
        self.calls.append("close")


class FakeServer:
    """One plan per connection attempt: {stage: exception to raise, ...}."""

    def __init__(self, *plans, attempt_seconds=0.0):
        self.plans, self.conns, self.sleeps, self.clock = list(plans), [], [], Clock()
        self.attempt_seconds = attempt_seconds

    def smtp(self, host, port, timeout=None):
        return FakeConn(self, host, port, timeout)

    def smtp_ssl(self, host, port, timeout=None, context=None):
        return FakeConn(self, host, port, timeout, context)

    def backend(self, security="starttls", port=587, timeout=15, max_retries=2):
        return SmtpBackend("smtp.example.test", port, security, USER, PASSWORD, timeout=timeout,
                           max_retries=max_retries, smtp_cls=self.smtp, smtp_ssl_cls=self.smtp_ssl,
                           sleep=self._sleep, clock=self.clock, context_factory=lambda: CTX)

    def _sleep(self, s):
        self.sleeps.append(s)
        self.clock.t += s


def msg(**kw):
    base = dict(subject="Weekly brief", text_body="plain", html_body="<p>rich</p>", to=(TO,), cc=(CC,), bcc=(BCC,),
                reply_to=("team@example.com",), from_email="sender@example.com", from_name="DeliveryLens")
    return EmailMessage(**{**base, **kw})


def settings(**kw):
    return replace(get_settings(), **kw)


SMTP_SETTINGS = dict(email_backend="smtp", smtp_host="smtp.example.test", smtp_port=587, smtp_security="starttls",
                     smtp_username=USER, smtp_password=PASSWORD, email_from_address="sender@example.com")


# ---------------------------------------------------------------- the conversation
def test_starttls_login_and_one_send():
    server = FakeServer()
    result = server.backend().send(msg())
    c = server.conns[0]
    assert c.calls == ["connect", "ehlo", "starttls", "ehlo", "login", "mail", "rcpt", "rcpt", "rcpt", "data", "quit"]
    assert c.debuglevel == 0 and c.timeout == 15 and c.starttls_context is CTX
    assert c.login_args == (USER, PASSWORD) and c.sender == "sender@example.com"
    assert c.rcpts == [TO, CC, BCC]  # Bcc is an envelope recipient ...
    assert BCC.encode() not in c.data_bytes and b"Bcc:" not in c.data_bytes  # ... and never in the message
    assert b"Reply-To: team@example.com" in c.data_bytes and b"multipart/alternative" in c.data_bytes
    assert result.provider == "smtp" and result.recipients == 3 and result.message_id.startswith("<")


def test_ssl_mode_uses_implicit_tls_and_no_starttls():
    server = FakeServer()
    server.backend(security="ssl", port=465).send(msg())
    c = server.conns[0]
    assert c.context is CTX and "starttls" not in c.calls and c.port == 465


def test_no_starttls_offered_means_no_login_and_no_retry():
    server = FakeServer({"starttls_offered": False})
    with pytest.raises(SmtpError, match="starttls failed") as e:
        server.backend().send(msg())
    assert "login" not in server.conns[0].calls and len(server.conns) == 1 and not e.value.transient


def test_the_real_tls_context_verifies_certificates():
    from app.email.backends import tls_context

    ctx = tls_context()
    assert ctx.verify_mode == ssl.CERT_REQUIRED and ctx.check_hostname
    assert ctx.minimum_version >= ssl.TLSVersion.TLSv1_2


# ---------------------------------------------------------------- retries
@pytest.mark.parametrize("plan", [
    {"connect": smtplib.SMTPServerDisconnected("dropped")},
    {"connect": TimeoutError()},
    {"connect": ConnectionRefusedError()},
    {"mail_reply": (421, b"try later")},
    {"data": smtplib.SMTPDataError(451, b"try later")},
])
def test_transient_failure_is_retried_then_sent_once(plan):
    server = FakeServer(plan, {})
    server.backend().send(msg())
    assert len(server.conns) == 2 and len(server.sleeps) == 1 and server.conns[1].data_bytes is not None
    assert sum(c.data_bytes is not None for c in server.conns) <= 2 and server.conns[0].calls[-1] in ("connect", "quit")


def test_retries_stop_after_max_retries():
    server = FakeServer(*[{"connect": TimeoutError()}] * 5)
    with pytest.raises(SmtpError) as e:
        server.backend(timeout=5).send(msg())
    assert len(server.conns) == 3 and len(server.sleeps) == 2 and e.value.transient  # 1 try + 2 retries


def test_retries_stay_within_the_time_budget():
    server = FakeServer(*[{"connect": TimeoutError()}] * 5, attempt_seconds=15)  # each attempt times out (15 s)
    with pytest.raises(SmtpError):
        server.backend(timeout=15).send(msg())
    assert len(server.conns) == 2 and server.clock.t <= SmtpBackend.DEADLINE_S  # a 3rd attempt would pass 40 s


@pytest.mark.parametrize("plan, code", [
    ({"login": smtplib.SMTPAuthenticationError(535, b"5.7.8 bad credentials")}, 535),
    ({"login": smtplib.SMTPAuthenticationError(525, b"5.7.1 Unauthorized IP address")}, 525),
    ({"mail_reply": (550, b"sender rejected")}, 550),
    ({"data": smtplib.SMTPDataError(554, b"rejected")}, 554),
    ({"starttls": ssl.SSLCertVerificationError("certificate verify failed")}, None),
])
def test_permanent_failure_is_not_retried(plan, code):
    server = FakeServer(plan, {})
    with pytest.raises(SmtpError) as e:
        server.backend().send(msg())
    assert len(server.conns) == 1 and server.sleeps == [] and not e.value.transient and e.value.code == code


def test_all_recipients_refused_is_permanent():
    replies = {r: (550, b"no such user") for r in (TO, CC, BCC)}
    server = FakeServer({"rcpt_replies": replies}, {})
    with pytest.raises(SmtpError, match="rcpt failed"):
        server.backend().send(msg())
    assert len(server.conns) == 1 and "rset" in server.conns[0].calls and server.conns[0].data_bytes is None


def test_some_recipients_refused_still_sends_and_logs_counts_only(caplog):
    server = FakeServer({"rcpt_replies": {CC: (550, b"no such user")}})
    with caplog.at_level(logging.WARNING, logger="app.email.backends"):
        result = server.backend().send(msg())
    assert result.recipients == 2
    record = json.loads(caplog.records[-1].getMessage())
    assert record == {"event": "email_recipients_refused", "backend": "smtp", "refused": 1, "accepted": 2}
    assert CC not in caplog.text


# ---------------------------------------------------------------- never a duplicate after DATA
def test_lost_reply_during_data_is_never_retried():
    server = FakeServer({"data": smtplib.SMTPServerDisconnected("connection lost")}, {})
    with pytest.raises(SmtpError) as e:
        server.backend().send(msg())
    assert len(server.conns) == 1 and e.value.outcome_unknown and not e.value.transient


def test_failure_after_data_accepted_is_success_without_retry():
    server = FakeServer({"quit": smtplib.SMTPServerDisconnected("gone")}, {})
    result = server.backend().send(msg())
    assert len(server.conns) == 1 and result.recipients == 3 and "close" in server.conns[0].calls


# ---------------------------------------------------------------- security: no leaks
def test_errors_and_logs_never_contain_credentials_addresses_or_server_text(caplog):
    server = FakeServer({"login": smtplib.SMTPAuthenticationError(535, f"5.7.8 bad login {USER} {TO}".encode())})
    backend = server.backend()
    s = settings(email_test_mode=False)
    with caplog.at_level(logging.DEBUG), pytest.raises(EmailDeliveryError) as e:
        send_email(msg(), backend=backend, settings=s)
    text = str(e.value) + repr(backend) + caplog.text
    for secret in (USER, PASSWORD, TO, CC, BCC, "bad login"):
        assert secret not in text, secret
    assert str(e.value) == "The smtp backend could not send the email (SMTPAuthenticationError, code 535)"
    assert e.value.__cause__ is None and e.value.__suppress_context__


def test_smtp_settings_hide_the_credentials():
    s = settings(**SMTP_SETTINGS)
    assert USER not in repr(s) and PASSWORD not in repr(s)


# ---------------------------------------------------------------- configuration and selection
def test_smtp_backend_from_settings():
    b = service.get_backend(settings(**SMTP_SETTINGS))
    assert isinstance(b, SmtpBackend) and (b.host, b.port, b.security, b.timeout) == ("smtp.example.test", 587,
                                                                                         "starttls", 15)
    assert b.max_retries == 2 and get_settings().smtp_max_retries == 2


@pytest.mark.parametrize("kw, error", [
    ({"smtp_password": ""}, "needs SMTP_PASSWORD"),
    ({"smtp_host": "", "smtp_username": ""}, "needs SMTP_HOST, SMTP_USERNAME"),
    ({"smtp_security": "none"}, "starttls or ssl"),
    ({"smtp_security": "ssl", "smtp_port": 587}, "does not match"),
    ({"smtp_port": 465}, "does not match"),
    ({"smtp_max_retries": 9}, "SMTP_MAX_RETRIES"),
])
def test_bad_smtp_settings_fail_closed(kw, error):
    with pytest.raises(EmailConfigError, match=error):
        service.get_backend(settings(**{**SMTP_SETTINGS, **kw}))


def test_check_command_logs_in_and_never_sends(monkeypatch, capsys):
    from app.email import __main__ as cli

    server = FakeServer()
    monkeypatch.setattr(cli, "_smtp_backend", lambda s: server.backend())
    assert cli.main(["check"]) == 0
    out = json.loads(capsys.readouterr().out)
    assert out == {"ok": True, "host": "smtp.example.test", "port": 587, "security": "starttls"}
    assert "mail" not in server.conns[0].calls and server.conns[0].calls[-1] == "quit"
    bad = FakeServer({"login": smtplib.SMTPAuthenticationError(525, b"Unauthorized IP address")})
    monkeypatch.setattr(cli, "_smtp_backend", lambda s: bad.backend())
    assert cli.main(["check"]) == 1
    out = capsys.readouterr().out
    assert '"stage": "login"' in out and "code 525" in out and PASSWORD not in out
    assert cli.main([]) == 2


# ---------------------------------------------------------------- test mode with SMTP
@pytest.fixture()
def smtp_server(monkeypatch):
    server = FakeServer(*[{}] * 10)
    monkeypatch.setattr(service, "SmtpBackend",
                        lambda *a, **k: SmtpBackend(*a, smtp_cls=server.smtp, smtp_ssl_cls=server.smtp_ssl,
                                                    sleep=server._sleep, clock=server.clock,
                                                    context_factory=lambda: CTX, **k))
    return server


def test_test_mode_restricts_smtp_to_the_test_recipients(smtp_server):
    s = settings(**SMTP_SETTINGS, email_test_mode=True, email_test_recipients=("qa1@example.com", "qa2@example.com"))
    send_email(msg(), settings=s)
    c = smtp_server.conns[0]
    assert c.rcpts == ["qa1@example.com", "qa2@example.com"]
    assert b"Subject: [TEST] Weekly brief" in c.data_bytes
    assert not any(a.encode() in c.data_bytes for a in (TO, CC, BCC))


def test_empty_test_list_means_no_connection_at_all(smtp_server):
    s = settings(**SMTP_SETTINGS, email_test_mode=True, email_test_recipients=())
    with pytest.raises(EmailConfigError, match="EMAIL_TEST_RECIPIENTS"):
        send_email(msg(), settings=s)
    assert smtp_server.conns == []


# ---------------------------------------------------------------- durable duplicate protection
def mem_settings(**kw):
    return settings(email_backend="memory", email_test_mode=False, email_from_address="sender@example.com", **kw)


def rows():
    from sqlalchemy import select

    from app.db import get_session
    from app.models import EmailSend

    with get_session() as s:
        return [(r.dedupe_key, r.status, r.trigger, r.resend) for r in s.scalars(select(EmailSend).order_by(EmailSend.id))]


def test_same_key_is_sent_once_across_processes(loaded_db):
    s = mem_settings()
    send_email(msg(), settings=s, idempotency_key="weekly_brief:2026-09-21:2026-11-02", trigger="timer")
    dedupe._table_ready = False  # a fresh process: nothing shared but the database
    with pytest.raises(AlreadySent) as e:
        send_email(msg(), settings=s, idempotency_key="weekly_brief:2026-09-21:2026-11-02")
    assert e.value.status == "sent" and len(MEMORY.outbox) == 1
    assert rows() == [("weekly_brief:2026-09-21:2026-11-02", "sent", "timer", False)]


def test_an_explicit_resend_sends_again_under_a_new_key(loaded_db):
    s, key = mem_settings(), "weekly_brief:2026-09-21:2026-11-02"
    send_email(msg(), settings=s, idempotency_key=key)
    send_email(msg(), settings=s, idempotency_key=key, resend=True, trigger="cli")
    assert len(MEMORY.outbox) == 2
    assert rows() == [(key, "sent", "api", False), (f"{key}:resend:1", "sent", "cli", True)]


def test_a_failed_send_may_be_retried(loaded_db):
    class Broken:
        name, addresses_recipients, requires_sender = "broken", True, False

        def send(self, message):
            raise ConnectionError("down")

    s, key = mem_settings(), "weekly_brief:2026-09-21:2026-11-02"
    with pytest.raises(EmailDeliveryError):
        send_email(msg(), backend=Broken(), settings=s, idempotency_key=key)
    assert rows() == [(key, "failed", "api", False)]
    send_email(msg(), settings=s, idempotency_key=key)  # nothing left the app last time: allowed
    assert rows() == [(key, "sent", "api", False)] and len(MEMORY.outbox) == 1


def test_an_unknown_outcome_blocks_until_an_explicit_resend(loaded_db):
    server = FakeServer({"data": smtplib.SMTPServerDisconnected("lost")})
    s, key = mem_settings(), "weekly_brief:2026-09-21:2026-11-02"
    with pytest.raises(EmailDeliveryError) as e:
        send_email(msg(), backend=server.backend(), settings=s, idempotency_key=key)
    assert e.value.outcome_unknown and rows()[0][1] == "unknown"
    with pytest.raises(AlreadySent) as blocked:
        send_email(msg(), settings=s, idempotency_key=key)
    assert blocked.value.status == "unknown"
    send_email(msg(), settings=s, idempotency_key=key, resend=True)
    assert len(MEMORY.outbox) == 1


def test_a_send_in_progress_blocks_even_a_resend_until_it_goes_stale(loaded_db):
    from sqlalchemy import update

    from app.db import get_session
    from app.models import EmailSend

    key = "weekly_brief:2026-09-21:2026-11-02"
    dedupe.claim(key, category="weekly_brief")  # another process is sending right now
    with pytest.raises(AlreadySent):
        send_email(msg(), settings=mem_settings(), idempotency_key=key)
    with pytest.raises(AlreadySent):
        send_email(msg(), settings=mem_settings(), idempotency_key=key, resend=True)
    with get_session() as s:  # that process died ten minutes ago
        s.execute(update(EmailSend).values(updated_at=datetime.now(timezone.utc) - timedelta(minutes=10)))
        s.commit()
    with pytest.raises(AlreadySent):  # still not retried automatically: it may have been sent
        send_email(msg(), settings=mem_settings(), idempotency_key=key)
    send_email(msg(), settings=mem_settings(), idempotency_key=key, resend=True)
    assert len(MEMORY.outbox) == 1


# ---------------------------------------------------------------- the Weekly Brief on top
def test_weekly_brief_over_smtp_in_test_mode(dataset, smtp_server, monkeypatch):
    from app.agents import weekly_brief as wb

    s = settings(**SMTP_SETTINGS, email_test_mode=True, email_test_recipients=("qa@example.com",),
                 weekly_brief_to=(TO,), weekly_brief_bcc=(BCC,))
    monkeypatch.setattr(service, "get_settings", lambda: s)
    r = wb.run_weekly_brief(dataset)
    assert r["delivery"]["configured"] and r["delivery"]["backend"] == "smtp"
    out = wb.send_brief(r)
    c = smtp_server.conns[-1]
    assert out["backend"] == "smtp" and c.rcpts == ["qa@example.com"]
    assert b"text/html" in c.data_bytes and b"text/plain" in c.data_bytes and BCC.encode() not in c.data_bytes


def test_timer_and_send_now_on_the_same_day_send_once_and_next_monday_sends_again(dataset, monkeypatch, capsys):
    from app.agents import weekly_brief as wb

    monkeypatch.setattr(service, "get_settings", lambda: mem_settings(weekly_brief_to=(TO,)))
    monday = datetime(2026, 11, 2).date()
    monkeypatch.setattr(wb, "send_date", lambda: monday)
    r = wb.run_weekly_brief(dataset)
    wb.send_brief(r)  # "Send now" at 06:50
    assert wb._main(["send"]) == 0  # the 07:00 timer
    assert json.loads(capsys.readouterr().out)["sent"] is False
    with pytest.raises(wb.AlreadySent):
        wb.send_brief(r)
    assert len(MEMORY.outbox) == 1
    monkeypatch.setattr(wb, "send_date", lambda: monday + timedelta(days=7))  # same data week, next Monday
    assert wb._main(["send"]) == 0 and json.loads(capsys.readouterr().out)["sent"] is True
    assert wb._main(["send", "--resend"]) == 0 and json.loads(capsys.readouterr().out)["resend"] is True
    assert len(MEMORY.outbox) == 3
    assert wb.send_key("2026-09-21") == "weekly_brief:2026-09-21:2026-11-09"


def test_send_endpoint_blocks_duplicates_and_guards_resend(client, monkeypatch):
    from app.agents import weekly_brief as wb
    from app.api import routes, security

    monkeypatch.setattr(service, "get_settings", lambda: mem_settings(weekly_brief_to=(TO,)))
    assert client.post("/api/briefs/weekly/send").status_code == 200
    again = client.post("/api/briefs/weekly/send")
    assert again.status_code == 409 and again.json()["error"]["code"] == "already_sent"
    denied = client.post("/api/briefs/weekly/send", json={"resend": True})
    assert denied.status_code == 403 and len(MEMORY.outbox) == 1  # no DEMO_TOKEN on this server

    token = replace(get_settings(), demo_token="demo-token-placeholder")
    monkeypatch.setattr(routes, "get_settings", lambda: token)
    monkeypatch.setattr(security, "get_settings", lambda: token)
    assert client.post("/api/briefs/weekly/send", json={"resend": True}).status_code == 401  # no header
    ok = client.post("/api/briefs/weekly/send", json={"resend": True},
                     headers={"X-Demo-Token": "demo-token-placeholder"})
    assert ok.status_code == 200 and ok.json()["resend"] is True and len(MEMORY.outbox) == 2


def test_send_endpoint_reports_provider_failure_without_details(client, smtp_server, monkeypatch):
    from app.agents import weekly_brief as wb

    smtp_server.plans = [{"login": smtplib.SMTPAuthenticationError(535, f"bad login {USER}".encode())}]
    monkeypatch.setattr(service, "get_settings",
                        lambda: settings(**SMTP_SETTINGS, email_test_mode=False, weekly_brief_to=(TO,)))
    r = client.post("/api/briefs/weekly/send")
    body = r.json()
    assert r.status_code == 502 and body["error"]["code"] == "email_not_sent"
    assert "SMTPAuthenticationError, code 535" in body["error"]["message"]
    assert USER not in r.text and PASSWORD not in r.text and TO not in r.text
    assert rows()[0][1] == "failed"


def test_several_weeks_back_to_back_like_a_demo(client, monkeypatch):
    """No time-based cooldown: different weeks send one after another; only the same week twice today is refused."""
    monkeypatch.setattr(service, "get_settings", lambda: mem_settings(weekly_brief_to=(TO,)))
    for week in ("2026-09-14", "2026-09-07", "2026-08-31"):
        assert client.post("/api/agents/weekly-brief", json={"week_of": week}).status_code == 200  # preview
        r = client.post("/api/briefs/weekly/send", json={"week_of": week})
        assert r.status_code == 200 and r.json()["week_of"] == week
    again = client.post("/api/briefs/weekly/send", json={"week_of": "2026-09-07"})
    assert again.status_code == 409 and again.json()["error"]["code"] == "already_sent"
    assert len(MEMORY.outbox) == 3
