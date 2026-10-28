"""Email backends: one interface, several ways to deliver.

sns     Amazon SNS topic (today's Weekly Brief). The topic's confirmed subscribers receive it, so the message's
        own recipients are ignored; plain text only, no attachments.
console Logs a summary (development). Nothing leaves the process.
memory  Keeps every message in a list (tests). Builds the full MIME message, as an SMTP provider would.
brevo   Brevo's transactional email HTTP API (BREVO_API_KEY): HTML and plain text to the message's recipients.

SMTP (Brevo) is the next stage; the service refuses EMAIL_BACKEND=smtp until it exists.
"""
import json
import logging
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
            with urllib.request.urlopen(req, timeout=self.TIMEOUT_S) as resp:  # noqa: S310 (fixed https URL)
                message_id = json.loads(resp.read() or b"{}").get("messageId")
        except urllib.error.HTTPError as exc:  # Brevo's error text is safe to log; the key is never in it
            raise RuntimeError(f"Brevo refused the email ({exc.code}): {exc.read()[:300].decode(errors='replace')}") from None
        return SendResult(self.name, message_id, len(message.recipients()))
