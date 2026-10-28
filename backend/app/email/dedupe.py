"""Durable duplicate-send protection: one row per send in email_sends, with a unique key.

claim(key) inserts a "sending" row. The database's unique constraint makes the claim atomic, so two processes
(the Monday timer and "Send now") or a restart cannot both send the same email.

An existing row decides what happens:
- sent                  -> AlreadySent
- sending               -> AlreadySent (in progress, or the process died mid-send: the outcome is unknown)
- unknown               -> AlreadySent (the provider may have accepted it; only an explicit resend goes out)
- failed                -> taken over and retried (nothing left the app)

An intentional resend (resend=True) adds a new row, <key>:resend:N, unless a send is still in progress.
Rows hold keys, statuses, counts and error classes only: no addresses and no bodies.
"""
import logging
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError

from app.config import get_settings
from app.db import get_engine, get_session

log = logging.getLogger(__name__)

IN_PROGRESS_GRACE = timedelta(minutes=2)  # longer than the SMTP time budget (about 40 s)


class AlreadySent(RuntimeError):
    def __init__(self, key: str, status: str, at: datetime | None):
        super().__init__(f"{key} is already {status}")
        self.key, self.status, self.at = key, status, at


@dataclass(frozen=True)
class Claim:
    id: int
    key: str


def send_date() -> date:
    """Today in the warehouses' time zone (the Monday timer runs on that clock)."""
    return datetime.now(ZoneInfo(get_settings().warehouse_tz)).date()


_table_ready = False


def _ensure_table() -> None:
    """The API creates every table at start-up; a separate process (the timer) may run first."""
    global _table_ready
    if not _table_ready:
        from app.models import EmailSend

        EmailSend.__table__.create(get_engine(), checkfirst=True)
        _table_ready = True


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(ts: datetime | None) -> datetime | None:
    return ts.replace(tzinfo=timezone.utc) if ts is not None and ts.tzinfo is None else ts  # SQLite drops the zone


def _insert(s, key: str, base: str, category: str, trigger: str, resend: bool) -> Claim | None:
    from app.models import EmailSend

    row = EmailSend(base_key=base, dedupe_key=key, category=category, trigger=trigger, resend=resend,
                    status="sending")
    s.add(row)
    try:
        s.commit()
    except IntegrityError:
        s.rollback()
        return None
    return Claim(row.id, key)


def claim(base_key: str, *, category: str, trigger: str = "api", resend: bool = False) -> Claim:
    """Reserve the right to send. Raises AlreadySent when the key is taken."""
    from app.models import EmailSend

    _ensure_table()
    with get_session() as s:
        if resend:
            busy = s.scalars(select(EmailSend).where(EmailSend.base_key == base_key,
                                                     EmailSend.status == "sending")).first()
            if busy and _now() - _aware(busy.updated_at) < IN_PROGRESS_GRACE:
                raise AlreadySent(busy.dedupe_key, "sending", _aware(busy.updated_at))
            n = s.scalar(select(func.count()).select_from(EmailSend).where(EmailSend.base_key == base_key))
            got = _insert(s, f"{base_key}:resend:{n}", base_key, category, trigger, True)
            if got is None:  # another resend won the same number
                raise AlreadySent(base_key, "sending", None)
            return got

        got = _insert(s, base_key, base_key, category, trigger, False)
        if got is not None:
            return got
        row = s.scalars(select(EmailSend).where(EmailSend.dedupe_key == base_key)).one()
        if row.status != "failed":
            raise AlreadySent(base_key, row.status, _aware(row.updated_at))
        # A failed attempt sent nothing: take it over, but only if nobody else did first (compare-and-set).
        taken = s.execute(update(EmailSend).where(EmailSend.id == row.id, EmailSend.status == "failed")
                          .values(status="sending", trigger=trigger, error=None, updated_at=_now()))
        s.commit()
        if taken.rowcount != 1:
            raise AlreadySent(base_key, "sending", None)
        return Claim(row.id, base_key)


def finish(c: Claim, *, status: str, backend: str | None = None, message_id: str | None = None,
           recipients: int = 0, error: str | None = None) -> None:
    from app.models import EmailSend

    with get_session() as s:
        s.execute(update(EmailSend).where(EmailSend.id == c.id).values(
            status=status, backend=backend, message_id=(message_id or None) and message_id[:300],
            recipients=recipients, error=error and error[:200], updated_at=_now()))
        s.commit()
