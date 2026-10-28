"""Email backends: one interface, several ways to deliver.

sns     Amazon SNS topic (today's Weekly Brief). The topic's confirmed subscribers receive it, so the message's
        own recipients are ignored; plain text only, no attachments.
console Logs a summary (development). Nothing leaves the process.
memory  Keeps every message in a list (tests). Builds the full MIME message, as an SMTP provider would.

SMTP (Brevo) is the next stage; the service refuses EMAIL_BACKEND=smtp until it exists.
"""
import logging
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
