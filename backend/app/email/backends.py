"""Email backends: one interface, several ways to deliver.

sns     Amazon SNS topic (today's Weekly Brief). The topic's confirmed subscribers receive it, so the message's
        own recipients are ignored; plain text only, no attachments.
console Logs a summary (development). Nothing leaves the process.
memory  Keeps every message in a list (tests). Builds the full MIME message, as an SMTP provider would.
brevo   Brevo's transactional email HTTP API (BREVO_API_KEY): HTML and plain text to the message's recipients.
smtp    Any SMTP relay (Brevo: smtp-relay.brevo.com:587) over STARTTLS or TLS, with retries for transient errors.
"""
import json
import logging
import random
import smtplib
import ssl
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Callable, Protocol

from app.email.message import EmailMessage, EmailValidationError

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class SendResult:
    provider: str
    message_id: str | None
    recipients: int  # envelope recipients handed to the provider; 0 when the provider picks them (SNS topic)


class EmailBackend(Protocol):
    name: str
    addresses_recipients: bool  # False: the provider decides who receives the email (an SNS topic)
    requires_sender: bool

    def send(self, message: EmailMessage) -> SendResult: ...


class SnsBackend:
    name = "sns"
    addresses_recipients = False
    requires_sender = False
    SUBJECT_MAX = 100  # SNS email subjects are cut at 100 characters

    def __init__(self, topic_arn: str, client_factory: Callable[[], object]):
        self.topic_arn = topic_arn
        self._client_factory = client_factory

    def send(self, message: EmailMessage) -> SendResult:
        if message.attachments:
            raise EmailValidationError("SNS email cannot carry attachments")
        if not message.text_body:
            raise EmailValidationError("SNS email needs a plain-text body")
        resp = self._client_factory().publish(TopicArn=self.topic_arn, Subject=message.subject[:self.SUBJECT_MAX],
                                              Message=message.text_body)
        return SendResult(self.name, resp.get("MessageId"), 0)

    def subscribers(self) -> dict:
        """Confirmed and pending subscribers of the topic (a pending one has no subscription ARN yet)."""
        subs = self._client_factory().list_subscriptions_by_topic(TopicArn=self.topic_arn)["Subscriptions"]
        confirmed = sum(1 for s in subs if s["SubscriptionArn"].startswith("arn:"))
        return {"confirmed": confirmed, "pending": len(subs) - confirmed}


class ConsoleBackend:
    name = "console"
    addresses_recipients = True
    requires_sender = False

    def send(self, message: EmailMessage) -> SendResult:
        log.info("console email (not sent): subject=%r to=%d cc=%d bcc=%d text=%d chars html=%d chars attachments=%d",
                 message.subject, len(message.to), len(message.cc), len(message.bcc), len(message.text_body or ""),
                 len(message.html_body or ""), len(message.attachments))
        log.debug("console email text body:\n%s", message.text_body or "")
        return SendResult(self.name, None, len(message.recipients()))


class MemoryBackend:
    name = "memory"
    addresses_recipients = True
    requires_sender = True

    def __init__(self):
        self.outbox: list[dict] = []

    def send(self, message: EmailMessage) -> SendResult:
        mime = message.to_mime()
        self.outbox.append({"message": message, "mime": mime, "envelope": list(message.recipients())})
        return SendResult(self.name, mime["Message-ID"], len(message.recipients()))

    def clear(self) -> None:
        self.outbox.clear()


class BrevoBackend:
    """Brevo transactional email API. The sender must be verified in Brevo, on a domain authenticated there
    (evoketechnologies.com rejects mail sent for it by others: DMARC p=reject)."""
    name = "brevo"
    addresses_recipients = True
    requires_sender = True
    URL = "https://api.brevo.com/v3/smtp/email"
    TIMEOUT_S = 20

    def __init__(self, api_key: str):
        self._api_key = api_key

    def send(self, message: EmailMessage) -> SendResult:
        if message.attachments:
            raise EmailValidationError("the brevo backend does not send attachments yet")
        sender = {"email": message.from_email, **({"name": message.from_name} if message.from_name else {})}
        payload = {"sender": sender, "subject": message.subject,
                   "to": [{"email": a} for a in message.to],
                   **({"cc": [{"email": a} for a in message.cc]} if message.cc else {}),
                   **({"bcc": [{"email": a} for a in message.bcc]} if message.bcc else {}),
                   **({"replyTo": {"email": message.reply_to[0]}} if message.reply_to else {}),
                   **({"htmlContent": message.html_body} if message.html_body else {}),
                   **({"textContent": message.text_body} if message.text_body else {})}
        req = urllib.request.Request(self.URL, data=json.dumps(payload).encode(), method="POST",
                                     headers={"api-key": self._api_key, "content-type": "application/json",
                                              "accept": "application/json"})
        try:
            # The URL is the fixed https constant above, never user input.
            with urllib.request.urlopen(req, timeout=self.TIMEOUT_S) as resp:  # noqa: S310  # nosec B310
                message_id = json.loads(resp.read() or b"{}").get("messageId")
        except urllib.error.HTTPError as exc:  # Brevo's error text is safe to log; the key is never in it
            raise RuntimeError(f"Brevo refused the email ({exc.code}): {exc.read()[:300].decode(errors='replace')}") from None
        return SendResult(self.name, message_id, len(message.recipients()))


class SmtpError(RuntimeError):
    """An SMTP failure with no server text (replies can echo addresses). `transient` failures may be retried;
    `outcome_unknown` means the server may already have accepted the email, so it must never be retried."""

    def __init__(self, stage: str, cause: BaseException, *, transient: bool, code: int | None = None,
                 outcome_unknown: bool = False):
        detail = f"{type(cause).__name__}" + (f", code {code}" if code else "")
        super().__init__(f"SMTP {stage} failed ({detail})")
        self.stage, self.code, self.transient, self.outcome_unknown = stage, code, transient, outcome_unknown
        self.error = detail


def _classify(stage: str, exc: BaseException) -> SmtpError:
    if isinstance(exc, SmtpError):
        return exc
    code = getattr(exc, "smtp_code", None)
    if isinstance(exc, smtplib.SMTPRecipientsRefused):
        codes = [c for c, _ in exc.recipients.values()]
        return SmtpError(stage, exc, transient=bool(codes) and all(400 <= c < 500 for c in codes),
                         code=min(codes) if codes else None)
    if isinstance(exc, smtplib.SMTPAuthenticationError) or isinstance(exc, smtplib.SMTPNotSupportedError):
        return SmtpError(stage, exc, transient=False, code=code)
    if isinstance(exc, smtplib.SMTPResponseException):  # sender refused, data error, connect error, ...
        return SmtpError(stage, exc, transient=code is not None and 400 <= code < 500, code=code)
    if isinstance(exc, ssl.SSLError):  # certificate or handshake problem: never retried
        return SmtpError(stage, exc, transient=False)
    if isinstance(exc, (smtplib.SMTPServerDisconnected, TimeoutError, ConnectionError, OSError)):
        return SmtpError(stage, exc, transient=True)
    return SmtpError(stage, exc, transient=False)


def tls_context() -> ssl.SSLContext:
    ctx = ssl.create_default_context()  # verifies the certificate and the host name
    ctx.minimum_version = ssl.TLSVersion.TLSv1_2
    return ctx


class SmtpBackend:
    """SMTP with STARTTLS (port 587) or implicit TLS (465); never plain text.

    Retries only transient failures (network errors, timeouts, 4xx replies), at most `max_retries` times within
    `deadline_s`. Once the DATA stage has started, a failure without a clear 4xx/5xx reply means the outcome is
    unknown: it is never retried, so a retry cannot send the email twice. Bcc addresses go in the envelope only.
    """
    name = "smtp"
    addresses_recipients = True
    requires_sender = True
    BACKOFF_S = (1.0, 3.0)
    DEADLINE_S = 40.0

    def __init__(self, host: str, port: int, security: str, username: str, password: str, *, timeout: float = 15,
                 max_retries: int = 2, deadline_s: float = DEADLINE_S, smtp_cls=smtplib.SMTP,
                 smtp_ssl_cls=smtplib.SMTP_SSL, sleep: Callable[[float], None] = time.sleep,
                 clock: Callable[[], float] = time.monotonic, context_factory: Callable[[], ssl.SSLContext] = tls_context):
        self.host, self.port, self.security, self.timeout = host, port, security, timeout
        self._username, self._password = username, password
        self.max_retries, self.deadline_s = max_retries, deadline_s
        self._smtp_cls, self._smtp_ssl_cls, self._sleep, self._clock = smtp_cls, smtp_ssl_cls, sleep, clock
        self._context_factory = context_factory

    def __repr__(self) -> str:  # never show the credentials
        return f"SmtpBackend({self.host}:{self.port}, {self.security})"

    def send(self, message: EmailMessage) -> SendResult:
        mime = message.to_mime()  # validated; no Bcc header
        data = mime.as_bytes()
        envelope = list(message.recipients())
        start = self._clock()
        for attempt in range(1, self.max_retries + 2):
            try:
                accepted = self._deliver(message.from_email, envelope, data)
                return SendResult(self.name, mime["Message-ID"], accepted)
            except SmtpError as err:
                last = err
            if not last.transient or attempt > self.max_retries:
                raise last
            delay = self.BACKOFF_S[min(attempt - 1, len(self.BACKOFF_S) - 1)] + random.uniform(0, 0.5)  # noqa: S311
            if self._clock() - start + delay + self.timeout > self.deadline_s:  # no room for another attempt
                raise last
            log.info(json.dumps({"event": "email_retry", "backend": self.name, "attempt": attempt,
                                 "error": last.error, "wait_s": round(delay, 1)}))
            self._sleep(delay)
        raise last  # pragma: no cover

    def check(self) -> dict:
        """Connect, secure the connection and log in, then quit. Never starts a send (no MAIL FROM)."""
        stage, conn = "connect", None
        try:
            conn = self._connect()
            conn.set_debuglevel(0)
            conn.ehlo()
            if self.security == "starttls":
                stage = "starttls"
                if not conn.has_extn("starttls"):
                    raise smtplib.SMTPNotSupportedError("STARTTLS not offered")
                conn.starttls(context=self._context_factory())
                conn.ehlo()
            stage = "login"
            conn.login(self._username, self._password)
            return {"ok": True, "host": self.host, "port": self.port, "security": self.security}
        except Exception as exc:
            err = _classify(stage, exc)
            return {"ok": False, "host": self.host, "port": self.port, "security": self.security,
                    "stage": stage, "error": err.error, "transient": err.transient}
        finally:
            if conn is not None:
                try:
                    conn.quit()
                except Exception:
                    try:
                        conn.close()
                    except Exception:  # noqa: S110
                        pass

    def _connect(self):
        if self.security == "ssl":
            return self._smtp_ssl_cls(self.host, self.port, timeout=self.timeout, context=self._context_factory())
        return self._smtp_cls(self.host, self.port, timeout=self.timeout)

    def _deliver(self, sender: str, envelope: list[str], data: bytes) -> int:
        stage = "connect"
        conn = None
        try:
            conn = self._connect()
            conn.set_debuglevel(0)  # debug output would include the login exchange
            stage = "ehlo"
            conn.ehlo()
            if self.security == "starttls":
                stage = "starttls"
                if not conn.has_extn("starttls"):
                    raise SmtpError(stage, smtplib.SMTPNotSupportedError("STARTTLS not offered"), transient=False)
                conn.starttls(context=self._context_factory())
                conn.ehlo()
            stage = "login"
            conn.login(self._username, self._password)
            stage = "mail"
            code, _ = conn.mail(sender)
            if code != 250:
                raise smtplib.SMTPSenderRefused(code, b"", sender)
            stage = "rcpt"
            refused = {}
            for r in envelope:
                code, _ = conn.rcpt(r)
                if code not in (250, 251):
                    refused[r] = (code, b"")
            if len(refused) == len(envelope):
                conn.rset()
                raise smtplib.SMTPRecipientsRefused(refused)
            stage = "data"
            try:
                code, _ = conn.data(data)
            except smtplib.SMTPResponseException as exc:  # a clear reply: the server did not take the email
                raise _classify(stage, exc) from None
            except Exception as exc:  # no reply: it may have been accepted, so never retry
                raise SmtpError(stage, exc, transient=False, outcome_unknown=True) from None
            if code != 250:
                raise _classify(stage, smtplib.SMTPDataError(code, b""))
            if refused:
                log.warning(json.dumps({"event": "email_recipients_refused", "backend": self.name,
                                        "refused": len(refused), "accepted": len(envelope) - len(refused)}))
            stage = "done"
            return len(envelope) - len(refused)
        except SmtpError:
            raise
        except Exception as exc:
            raise _classify(stage, exc) from None
        finally:
            if conn is not None:
                try:
                    conn.quit()  # after DATA was accepted, a failure here changes nothing
                except Exception:
                    try:
                        conn.close()
                    except Exception:  # noqa: S110 (closing a dead connection)
                        pass
