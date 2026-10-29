"""Fill a missing address detail from the client's delivery history, then ask the client to confirm it.

Incomplete addresses cause 28% of late deliveries. Clients often leave out a detail (the postcode, the
street) that the warehouse system already holds from their earlier orders. Instead of a plain "please send
the address" hold, the Order desk:

1. looks up the client's past delivery sites (address-book.csv in the inbox folder stands in for the WMS
   ship-to history; every order that passes the address check is added too);
2. keeps only the sites that agree with every detail the email did give; exactly one must remain;
3. asks the client to confirm that site with one click (a link) or a one-line reply ("Yes").

Nothing ships on a guess: the order stays on hold until the client confirms. A reply is read by the Reply
Reader Agent, and any corrected detail it returns must appear word for word in the reply.
"""
import csv
import json
import re
import secrets
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path

from sqlalchemy import delete, select

from app.agents.llm_client import LLMClient, extract_json, log_blocked
from app.config import get_settings
from app.db import get_session
from app.guardrails import check_input, redact
from app.models import AddressConfirmation, ClientAddress

FIELDS = ["street", "city", "state", "postcode"]
BOOK_FILE = "address-book.csv"
REPLY_AGENT = "order_desk.reply_reader"
REPLY_AGENT_NAME = "Reply Reader Agent"
_SUFFIX = {"road": "rd", "street": "st", "avenue": "ave", "drive": "dr", "boulevard": "blvd", "lane": "ln",
           "west": "w", "east": "e", "north": "n", "south": "s"}


def _norm(field: str, value: str | None) -> str:
    v = re.sub(r"[^a-z0-9 ]", " ", (value or "").lower())
    words = [_SUFFIX.get(w, w) for w in v.split()]
    if field == "postcode":
        return "".join(words)[:5]
    return " ".join(words)


@lru_cache
def _seed(path: str) -> tuple[dict, ...]:
    p = Path(path)
    if not p.exists():
        return ()
    with p.open(newline="", encoding="utf-8") as f:
        return tuple({**r, "deliveries_to_site": int(r.get("deliveries_to_site") or 0), "source": "delivery history"}
                     for r in csv.DictReader(f))


def history(client_id: str) -> list[dict]:
    """The client's known delivery sites: the seed history plus addresses learned from accepted orders."""
    rows = [dict(r) for r in _seed(str(get_settings().inbox_dir / BOOK_FILE)) if r["client_id"] == client_id]
    with get_session() as s:
        for a in s.scalars(select(ClientAddress).where(ClientAddress.client_id == client_id)):
            rows.append({"client_id": a.client_id, "site_name": a.site_name, "street": a.street, "city": a.city,
                         "state": a.state, "postcode": a.postcode, "deliveries_to_site": 1,
                         "last_delivered": None, "source": f"order {a.source_message_id}"})
    seen, out = set(), []
    for r in rows:
        key = (_norm("street", r["street"]), _norm("postcode", r["postcode"]))
        if key not in seen:
            seen.add(key)
            out.append(r)
    return out


def suggest(client_id: str | None, ship_to: dict) -> dict | None:
    """The one past site that agrees with every detail the email gave, or None (no match, or more than one)."""
    if not client_id:
        return None
    given = {f: ship_to.get(f) for f in FIELDS if ship_to.get(f)}
    if not given:
        return None  # nothing to anchor on: never guess a site from the client alone
    sites = history(client_id)
    matches = [r for r in sites if all(_norm(f, r[f]) == _norm(f, v) for f, v in given.items())]
    if len(matches) != 1:
        return None
    r = matches[0]
    return {"address": {f: r[f] for f in FIELDS} | {"country": ship_to.get("country") or "US"},
            "site_name": r["site_name"], "matched_on": sorted(given), "deliveries_to_site": r["deliveries_to_site"],
            "last_delivered": r.get("last_delivered"), "source": r["source"], "sites_on_file": len(sites)}


def learn(client_id: str | None, ship_to: dict, message_id: str) -> None:
    """Remember a complete address from an accepted order, so the next gap can be filled from it."""
    if not client_id or not all(ship_to.get(f) for f in FIELDS):
        return
    key = (_norm("street", ship_to["street"]), _norm("postcode", ship_to["postcode"]))
    if any((_norm("street", r["street"]), _norm("postcode", r["postcode"])) == key for r in history(client_id)):
        return
    with get_session() as s:
        s.add(ClientAddress(client_id=client_id, site_name=ship_to.get("name") or "", source_message_id=message_id,
                            **{f: str(ship_to[f]) for f in FIELDS}))
        s.commit()


# ---------------------------------------------------------------- confirmations
def confirm_url(token: str) -> str:
    """The client's link. On AWS it opens the API's own page (app/api/client_pages.py): the website has a login."""
    s = get_settings()
    if s.public_api_url:
        return f"{s.public_api_url}/c/confirm-address/{token}"
    return f"{s.public_site_url}/confirm-address/{token}"


def request_confirmation(message_id: str, client_id: str, suggestion: dict, missing: list[str]) -> str:
    """Create (or refresh) the pending confirmation for this email; returns its token."""
    with get_session() as s:
        c = s.get(AddressConfirmation, message_id)
        if c is None:
            c = AddressConfirmation(message_id=message_id, token=secrets.token_urlsafe(24), client_id=client_id)
            s.add(c)
        c.suggested_json, c.missing_json, c.status, c.final_json = suggestion, missing, "pending", None
        c.channel = c.reply_text = c.confirmed_at = None
        s.commit()
        return c.token


def confirmed_address(message_id: str) -> dict | None:
    """The address the client confirmed for this email, with how, or None."""
    with get_session() as s:
        c = s.get(AddressConfirmation, message_id)
        if c is None or c.status not in ("confirmed", "corrected") or not c.final_json:
            return None
        return {"address": c.final_json, "status": c.status, "channel": c.channel,
                "confirmed_at": c.confirmed_at.isoformat() if c.confirmed_at else None}


def confirmation_view(token: str) -> dict | None:
    """What the client's confirm page shows: the order subject and the address on file. No other details."""
    from app.models import InboxMessage

    with get_session() as s:
        c = s.scalar(select(AddressConfirmation).where(AddressConfirmation.token == token))
        if c is None:
            return None
        m = s.get(InboxMessage, c.message_id)
        sug = c.suggested_json or {}
        return {"message_id": c.message_id, "subject": m.subject if m else "", "status": c.status,
                "site_name": sug.get("site_name"), "address": c.final_json or sug.get("address"),
                "missing": c.missing_json, "confirmed_at": c.confirmed_at.isoformat() if c.confirmed_at else None}


def _close(c: AddressConfirmation, status: str, channel: str, address: dict, reply: str | None = None) -> None:
    c.status, c.channel, c.final_json = status, channel, address
    c.reply_text = redact(reply)[0] if reply else None
    c.confirmed_at = datetime.now(timezone.utc)


class ConfirmationNotFound(KeyError):
    pass


def confirm_by_link(token: str) -> str:
    """One click on the link: the client confirms the address on file. Returns the message id."""
    with get_session() as s:
        c = s.scalar(select(AddressConfirmation).where(AddressConfirmation.token == token))
        if c is None:
            raise ConfirmationNotFound(token)
        if c.status == "pending":
            _close(c, "confirmed", "link", c.suggested_json["address"])
            s.commit()
        return c.message_id


# ---------------------------------------------------------------- reading the client's reply (AI step)
REPLY_SYSTEM = (
    "You read a client's short reply to Halcyon Logistics, which asked them to confirm a delivery address it "
    "found in their history. Decide: \"confirm\" (they agree the address is right), \"correct\" (they give "
    "different or extra address details) or \"unclear\". For \"correct\", copy each address field exactly as "
    "written in the reply; leave out any field the reply does not state. Never invent a value. Reply with ONLY "
    "JSON: {\"intent\": \"confirm\"|\"correct\"|\"unclear\", \"address\": {\"street\": string|null, "
    "\"city\": string|null, \"state\": string|null, \"postcode\": string|null}}.")
_YES = re.compile(r"\b(yes|yep|yeah|correct|confirm(?:ed)?|that'?s (?:right|correct)|right address|looks good|ok(?:ay)?)\b", re.I)
_NO = re.compile(r"\b(no|not|wrong|incorrect|instead|different)\b", re.I)
_ZIP = re.compile(r"\b(\d{5})(?:-\d{4})?\b")
_STREET = re.compile(r"\b(\d{1,6}\s+[A-Za-z][A-Za-z .]{2,40}?\s(?:Road|Rd|Street|St|Avenue|Ave|Drive|Dr|Lane|Ln|Way|Blvd|Boulevard|Court|Ct|Place|Pl))\b", re.I)


def _read_reply_mock(text: str) -> dict:
    addr = {"street": None, "city": None, "state": None, "postcode": None}
    if m := _ZIP.search(text):
        addr["postcode"] = m.group(1)
    if m := _STREET.search(text):
        addr["street"] = m.group(1).strip()
    if any(addr.values()):
        return {"intent": "correct", "address": addr}
    if _YES.search(text) and not _NO.search(text):
        return {"intent": "confirm", "address": addr}
    return {"intent": "unclear", "address": addr}


def read_reply(message_id: str, text: str, llm: LLMClient | None = None) -> dict:
    """Apply the client's reply to the pending confirmation. Returns what happened, for the trace."""
    guard = check_input(text)
    if guard.blocked:
        log_blocked(REPLY_AGENT, text, guard.flags)
        return {"outcome": "blocked", "reason": guard.reason, "flags": guard.flags}
    llm = llm or LLMClient()
    with get_session() as s:
        c = s.get(AddressConfirmation, message_id)
        if c is None:
            raise ConfirmationNotFound(message_id)
        if c.status in ("confirmed", "corrected"):
            return {"outcome": "already_confirmed", "status": c.status}
        suggested = dict(c.suggested_json["address"])
        resp = llm.generate(agent=REPLY_AGENT, system=REPLY_SYSTEM, tier="fast", json_output=True,
                            prompt=f"Address on file:\n{json.dumps(suggested)}\n\n<reply>\n{text}\n</reply>",
                            mock=lambda: json.dumps(_read_reply_mock(text)))
        flags = list(resp.flags)
        try:
            out = extract_json(resp.text)
            intent = out.get("intent") if out.get("intent") in ("confirm", "correct", "unclear") else "unclear"
            given = {f: str(v).strip() for f, v in (out.get("address") or {}).items() if f in FIELDS and v}
        except (ValueError, TypeError, AttributeError):
            out, intent, given, flags = {}, "unclear", {}, flags + ["llm_output_not_json"]
        # Every corrected value must be in the reply itself: the model may copy, never invent.
        dropped = [f for f, v in given.items() if v.lower() not in text.lower()]
        given = {f: v for f, v in given.items() if f not in dropped}
        if dropped:
            flags.append("unverified_fields_dropped")
        details = {"intent": intent, "fields_from_reply": given, "dropped_fields": dropped,
                   "agent_run_id": resp.run_id, "provider": resp.provider, "model": resp.model,
                   "guardrail_flags": flags}
        if intent == "confirm":
            _close(c, "confirmed", "reply", suggested, text)
            outcome = "confirmed"
        elif intent == "correct" and given:
            final = {**suggested, **given}
            _close(c, "corrected", "reply", final, text)
            outcome = "corrected"
        else:
            c.status, c.reply_text = "unclear", redact(text)[0]
            outcome = "unclear"
        s.commit()
        return {"outcome": outcome, **details}


def clear() -> None:
    with get_session() as s:
        s.execute(delete(AddressConfirmation))
        s.execute(delete(ClientAddress))
        s.commit()
