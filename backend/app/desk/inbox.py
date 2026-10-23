"""The shared order inbox: read the sample .eml files and load them into inbox_messages.

data/sample-inbox/manifest.json lists each email with its scenario and expected decision. The loader
replaces inbox_messages (and clears wms_orders, which depend on them) on every run, so it is idempotent.
"""
import json
import logging
from email import policy
from email.parser import BytesParser
from email.utils import parsedate_to_datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from sqlalchemy import delete, insert
from sqlalchemy.engine import Engine

from app.config import get_settings
from app.models import InboxMessage, WmsOrder

log = logging.getLogger(__name__)


def parse_eml(raw: bytes, tz: str) -> dict:
    """Headers, plain-text body and text attachments of one email. The Date header becomes
    warehouse-local time (naive), which is what the 08:00 pick-list cutoff is measured in."""
    msg = BytesParser(policy=policy.default).parsebytes(raw)
    sender = msg["From"].addresses[0] if msg["From"] else None
    body_part = msg.get_body(preferencelist=("plain",))
    attachments = []
    for part in msg.iter_attachments():
        content = part.get_content()
        attachments.append({"filename": part.get_filename() or "attachment",
                            "content_type": part.get_content_type(),
                            "text": content if isinstance(content, str) else ""})
    received = parsedate_to_datetime(msg["Date"]).astimezone(ZoneInfo(tz)).replace(tzinfo=None)
    return {
        "from_name": sender.display_name if sender else "",
        "from_email": sender.addr_spec if sender else "",
        "subject": str(msg["Subject"] or ""),
        "received_at": received,
        "body": body_part.get_content().strip() if body_part else "",
        "attachments_json": attachments,
    }


def load_inbox(engine: Engine, inbox_dir: Path | None = None) -> int:
    """Replace the inbox with the sample emails. Returns the number of messages (0 if no inbox folder)."""
    inbox_dir = Path(inbox_dir or get_settings().inbox_dir)
    manifest_path = inbox_dir / "manifest.json"
    if not manifest_path.exists():
        log.warning("No sample inbox at %s; the Order desk will be empty", inbox_dir)
        return 0
    tz = get_settings().warehouse_tz
    rows = []
    for m in json.loads(manifest_path.read_text())["messages"]:
        parsed = parse_eml((inbox_dir / m["file"]).read_bytes(), tz)
        rows.append({"id": m["id"], "file": m["file"], "client_id": m.get("client_id"),
                     "scenario": m.get("scenario", ""), "expected_decision": m.get("expected_decision", ""),
                     "what_it_demonstrates": m.get("what_it_demonstrates", ""), "status": "new",
                     "decision": None, "processed_at": None, **parsed})
    with engine.begin() as conn:
        conn.execute(delete(WmsOrder))
        conn.execute(delete(InboxMessage))
        conn.execute(insert(InboxMessage), rows)
    return len(rows)


def message_summary(m: InboxMessage) -> dict:
    return {"id": m.id, "from_name": m.from_name, "from_email": m.from_email, "client_id": m.client_id,
            "subject": m.subject, "received_at": m.received_at.strftime("%Y-%m-%d %H:%M"),
            "scenario": m.scenario, "expected_decision": m.expected_decision,
            "what_it_demonstrates": m.what_it_demonstrates, "has_attachment": bool(m.attachments_json),
            "status": m.status, "decision": m.decision}


def message_detail(m: InboxMessage) -> dict:
    return {**message_summary(m), "body": m.body, "attachments": list(m.attachments_json or [])}
