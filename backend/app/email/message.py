"""One email, independent of how it is delivered (SNS today; SMTP, console or memory through the same service).

Addresses are normalised on creation: an address listed in To is dropped from Cc and Bcc, and one in Cc is
dropped from Bcc, so nobody gets the same email twice. Bcc addresses are envelope recipients only: they are
never written into the message headers (see to_mime).
"""
import re
from dataclasses import dataclass, field
from email.message import EmailMessage as MimeMessage
from email.utils import formataddr, formatdate, make_msgid

MAX_SUBJECT_CHARS = 255
MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024  # all attachments together
_ADDRESS_RE = re.compile(r"^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$")
_LINE_BREAK = re.compile(r"[\r\n]")


class EmailValidationError(ValueError):
    pass


@dataclass(frozen=True)
class Attachment:
    filename: str
    content: bytes
    mime_type: str = "application/octet-stream"


def _addresses(value) -> tuple[str, ...]:
    if not value:
        return ()
    if isinstance(value, str):
        value = value.split(",")
    return tuple(a.strip() for a in value if a and a.strip())


def _without(addresses: tuple[str, ...], seen: set[str]) -> tuple[str, ...]:
    out = []
    for a in addresses:
        if a.lower() not in seen:
            seen.add(a.lower())
            out.append(a)
    return tuple(out)


@dataclass(frozen=True)
class EmailMessage:
    subject: str
    text_body: str | None = None
    html_body: str | None = None
    to: tuple[str, ...] = ()
    cc: tuple[str, ...] = ()
    bcc: tuple[str, ...] = ()
    reply_to: tuple[str, ...] = ()
    from_email: str | None = None
    from_name: str | None = None
    attachments: tuple[Attachment, ...] = field(default=())
    category: str = "general"  # names the email in logs, e.g. "weekly_brief"

    def __post_init__(self):
        seen: set[str] = set()
        for name in ("to", "cc", "bcc"):
            object.__setattr__(self, name, _without(_addresses(getattr(self, name)), seen))
        object.__setattr__(self, "reply_to", _addresses(self.reply_to))
        object.__setattr__(self, "attachments", tuple(self.attachments or ()))

    def recipients(self) -> tuple[str, ...]:
        """Everyone the email goes to (the SMTP envelope): To, then Cc, then Bcc."""
        return self.to + self.cc + self.bcc

    def validate(self, *, require_recipients: bool = True, require_sender: bool = False) -> None:
        """Raise EmailValidationError for anything a provider would reject or that could inject headers."""
        if not self.subject or not self.subject.strip():
            raise EmailValidationError("The subject is empty")
        if _LINE_BREAK.search(self.subject):
            raise EmailValidationError("The subject may not contain a line break")
        if len(self.subject) > MAX_SUBJECT_CHARS:
            raise EmailValidationError(f"The subject is longer than {MAX_SUBJECT_CHARS} characters")
        if not (self.text_body and self.text_body.strip()) and not (self.html_body and self.html_body.strip()):
            raise EmailValidationError("The email has no body (text or HTML)")
        for kind in ("to", "cc", "bcc", "reply_to"):
            for a in getattr(self, kind):
                if not _ADDRESS_RE.match(a):
                    raise EmailValidationError(f"Not a valid email address in {kind}")  # the address is not echoed
        if require_recipients and not self.to:
            raise EmailValidationError("The email has no To recipient")
        if self.from_email and not _ADDRESS_RE.match(self.from_email):
            raise EmailValidationError("The sender address is not valid")
        if require_sender and not self.from_email:
            raise EmailValidationError("The email has no sender address (set EMAIL_FROM_ADDRESS)")
        if self.from_name and _LINE_BREAK.search(self.from_name):
            raise EmailValidationError("The sender name may not contain a line break")
        total = 0
        for att in self.attachments:
            if not att.filename or re.search(r"[\r\n/\\]", att.filename):
                raise EmailValidationError("An attachment has an empty or unsafe file name")
            if "/" not in att.mime_type:
                raise EmailValidationError(f"Attachment {att.filename!r} has no valid MIME type")
            total += len(att.content)
        if total > MAX_ATTACHMENT_BYTES:
            raise EmailValidationError(f"Attachments exceed {MAX_ATTACHMENT_BYTES // (1024 * 1024)} MB")

    def to_mime(self) -> MimeMessage:
        """The RFC 5322 message for SMTP-style providers. Bcc is deliberately not a header."""
        self.validate(require_recipients=True, require_sender=True)
        m = MimeMessage()
        m["From"] = formataddr((self.from_name or "", self.from_email))
        m["To"] = ", ".join(self.to)
        if self.cc:
            m["Cc"] = ", ".join(self.cc)
        if self.reply_to:
            m["Reply-To"] = ", ".join(self.reply_to)
        m["Subject"] = self.subject
        m["Date"] = formatdate(usegmt=True)
        m["Message-ID"] = make_msgid(domain=self.from_email.split("@", 1)[1])
        if self.text_body:
            m.set_content(self.text_body)
            if self.html_body:
                m.add_alternative(self.html_body, subtype="html")
        else:
            m.set_content(self.html_body, subtype="html")
        for att in self.attachments:
            maintype, subtype = att.mime_type.split("/", 1)
            m.add_attachment(att.content, maintype=maintype, subtype=subtype, filename=att.filename)
        return m
