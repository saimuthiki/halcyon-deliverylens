"""send_email(): the one way the application sends email.

1. Pick the backend from EMAIL_BACKEND (sns by default).
2. Fill the sender and reply-to from settings when the message has none.
3. Test mode (EMAIL_TEST_MODE, on by default): send only to EMAIL_TEST_RECIPIENTS, drop Cc and Bcc, and mark
   the subject [TEST]. It applies to backends that address recipients; an SNS topic always goes to its own
   confirmed subscribers.
4. Validate, send, and log one structured line. Logs carry counts and the provider's message id, never
   addresses, bodies or credentials.
"""
import json
import logging
import time
from dataclasses import dataclass, replace
from typing import Callable

from app.config import Settings, get_settings
from app.email.backends import ConsoleBackend, EmailBackend, MemoryBackend, SendResult, SnsBackend
from app.email.message import EmailMessage, EmailValidationError

log = logging.getLogger(__name__)

BACKENDS = ("sns", "console", "memory", "smtp")
TEST_SUBJECT_PREFIX = "[TEST] "
MEMORY = MemoryBackend()  # shared outbox for EMAIL_BACKEND=memory (tests, local runs)


class EmailConfigError(RuntimeError):
    """Email is not set up for this request (no topic, no recipients, an unknown or unavailable backend)."""


class EmailDeliveryError(RuntimeError):
    """The provider was reached but the email could not be sent."""


@dataclass(frozen=True)
class Recipients:
    to: tuple[str, ...] = ()
    cc: tuple[str, ...] = ()
    bcc: tuple[str, ...] = ()

    def count(self) -> dict:
        return {"to": len(self.to), "cc": len(self.cc), "bcc": len(self.bcc)}


def _default_sns_client(region: str) -> Callable[[], object]:
    def factory():
        import boto3

        return boto3.client("sns", region_name=region)
    return factory


def get_backend(settings: Settings | None = None, *, sns_topic_arn: str | None = None,
                sns_client_factory: Callable[[], object] | None = None) -> EmailBackend:
    s = settings or get_settings()
    name = s.email_backend
    if name == "sns":
        if not sns_topic_arn:
            raise EmailConfigError("the sns email backend needs a topic ARN")
        return SnsBackend(sns_topic_arn, sns_client_factory or _default_sns_client(s.aws_region))
    if name == "console":
        return ConsoleBackend()
    if name == "memory":
        return MEMORY
    if name == "smtp":
        raise EmailConfigError("EMAIL_BACKEND=smtp is not available yet (planned for the next stage)")
    raise EmailConfigError(f"Unknown EMAIL_BACKEND {name!r}; use one of {', '.join(BACKENDS)}")


def recipients_for(list_name: str, settings: Settings | None = None) -> Recipients:
    """A recipient list from settings, e.g. "weekly_brief" -> WEEKLY_BRIEF_TO / _CC / _BCC."""
    s = settings or get_settings()
    return Recipients(*(tuple(getattr(s, f"{list_name}_{k}", ())) for k in ("to", "cc", "bcc")))


def missing_recipients(list_name: str, settings: Settings | None = None) -> str | None:
    """Why a backend that addresses recipients could not send to this list, or None when it can."""
    s = settings or get_settings()
    if s.email_test_mode:
        return None if s.email_test_recipients else "EMAIL_TEST_MODE is on but EMAIL_TEST_RECIPIENTS is empty"
    return None if recipients_for(list_name, s).to else f"{list_name.upper()}_TO is empty"


def describe(list_name: str, settings: Settings | None = None) -> dict:
    """How email for this list would be sent right now, without secrets or addresses."""
    s = settings or get_settings()
    r = recipients_for(list_name, s)
    out = {"backend": s.email_backend, "test_mode": s.email_test_mode, "recipients": r.count(),
           "missing": missing_recipients(list_name, s)}
    if s.email_test_mode:
        out["test_recipients"] = len(s.email_test_recipients)
    return out


def _prepare(message: EmailMessage, backend: EmailBackend, s: Settings) -> tuple[EmailMessage, bool]:
    message = replace(message, from_email=message.from_email or s.email_from_address or None,
                      from_name=message.from_name or s.email_from_name or None,
                      reply_to=message.reply_to or s.email_reply_to)
    if not backend.addresses_recipients:
        if message.recipients():
            log.warning("email %s: the %s backend ignores the message recipients (%d)", message.category,
                        backend.name, len(message.recipients()))
        return message, False
    if not s.email_test_mode:
        return message, False
    if not s.email_test_recipients:
        raise EmailConfigError("EMAIL_TEST_MODE is on but EMAIL_TEST_RECIPIENTS is empty")
    subject = message.subject if message.subject.startswith(TEST_SUBJECT_PREFIX) else TEST_SUBJECT_PREFIX + message.subject
    return replace(message, to=s.email_test_recipients, cc=(), bcc=(), subject=subject), True


def _log(event: str, message: EmailMessage, backend: EmailBackend, test_mode: bool, **extra) -> None:
    record = {"event": event, "category": message.category, "backend": backend.name, "test_mode": test_mode,
              "to": len(message.to), "cc": len(message.cc), "bcc": len(message.bcc),
              "attachments": len(message.attachments), **extra}
    (log.error if event == "email_failed" else log.info)(json.dumps(record))


def send_email(message: EmailMessage, *, backend: EmailBackend | None = None,
               settings: Settings | None = None) -> SendResult:
    """Send one email through the configured backend. Raises EmailConfigError, EmailValidationError or
    EmailDeliveryError; the original provider exception is chained, never logged with the message content."""
    s = settings or get_settings()
    backend = backend or get_backend(s)
    message, test_mode = _prepare(message, backend, s)
    message.validate(require_recipients=backend.addresses_recipients, require_sender=backend.requires_sender)
    start = time.perf_counter()
    try:
        result = backend.send(message)
    except EmailValidationError:
        raise
    except Exception as exc:
        _log("email_failed", message, backend, test_mode, error=type(exc).__name__,
             latency_ms=int((time.perf_counter() - start) * 1000))
        raise EmailDeliveryError(f"The {backend.name} backend could not send the email ({type(exc).__name__})") from exc
    _log("email_sent", message, backend, test_mode, message_id=result.message_id,
         latency_ms=int((time.perf_counter() - start) * 1000))
    return result
