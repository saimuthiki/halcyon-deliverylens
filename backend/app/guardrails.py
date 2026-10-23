"""Simple, deterministic guardrails around the AI agents.

- redact(): mask emails and phone numbers before text is logged; redact_payload() does it for nested data.
- check_input(): basic prompt-injection screening (after normalising case, whitespace and zero-width
  characters) and a size cap. This is a screen, not a security boundary: the agents' outcomes are also
  fixed by deterministic rules and output checks.
"""
import re
import unicodedata
from dataclasses import dataclass, field

MAX_INPUT_CHARS = 20000

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
# Needs separators between groups so postcodes, dates and SKUs are left alone.
PHONE_RE = re.compile(r"(?<!\w)(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{3}\)\s?|\d{3}[\s.-])\d{3}[\s.-]\d{4}(?!\w)")

_QUALIFIER = r"(?:(?:all|any|the|these|those|of|your|previous|prior|above|earlier|preceding|original|system|initial)\s+)"
INJECTION_PATTERNS = [
    # "ignore / disregard / forget / override the previous instructions" (but not "my previous instructions")
    rf"\b(?:ignore|disregard|forget|override|bypass)\s+{_QUALIFIER}+(?:instructions|rules|prompts?|guidelines|directives)\b",
    r"\b(?:reveal|leak)\s+(?:me\s+)?(?:your|the)\s+(?:\w+\s+){0,2}?"
    r"(?:prompt|instructions|api\s*keys?|secrets?|passwords?|credentials)\b",
    r"\b(?:show|print|repeat|output)\s+(?:me\s+)?your\s+(?:\w+\s+){0,2}?(?:prompt|instructions|rules)\b",
    r"\bsystem\s+prompt\b",
    r"\byou\s*(?:are|'re)\s+now\s+(?:a|an|in|dan|acting|playing|free|unrestricted|jailbroken)\b",
    r"\bdeveloper\s+mode\b",
    r"\bjailbreak",
    r"\bdan\s+mode\b",
    r"\bnew\s+instructions\s*:",
    r"</?\s*(?:system|assistant|instructions?)\s*>",
    r"\[\s*/?\s*(?:inst|system)\s*\]",
    r"<\|\s*im_(?:start|end)\s*\|>",
]
INJECTION_RE = re.compile("|".join(INJECTION_PATTERNS))
_ZERO_WIDTH_RE = re.compile("[\u00ad\u200b-\u200f\u2060-\u2064\ufeff]")
# A long unbroken base64 run (letters of both cases and digits) can smuggle encoded instructions.
_BASE64_RE = re.compile(r"[A-Za-z0-9+/]{80,}={0,2}")


def normalise(text: str) -> str:
    """Lower-case, NFKC, no zero-width characters, single spaces: what the patterns are matched against."""
    text = _ZERO_WIDTH_RE.sub("", unicodedata.normalize("NFKC", text))
    return re.sub(r"\s+", " ", text).strip().lower().replace("\u2019", "'")


def _has_base64_block(text: str) -> bool:
    for m in _BASE64_RE.finditer(text):
        block = m.group(0)
        if re.search(r"[A-Z]", block) and re.search(r"[a-z]", block) and re.search(r"\d", block):
            return True
    return False


@dataclass
class GuardrailResult:
    blocked: bool = False
    flags: list[str] = field(default_factory=list)
    reason: str | None = None


def redact(text: str) -> tuple[str, list[str]]:
    flags = []
    if EMAIL_RE.search(text):
        text = EMAIL_RE.sub("[EMAIL]", text)
        flags.append("redacted_email")
    if PHONE_RE.search(text):
        text = PHONE_RE.sub("[PHONE]", text)
        flags.append("redacted_phone")
    return text, flags


def redact_payload(value):
    """Redact every string inside nested dicts/lists (used before archiving to S3)."""
    if isinstance(value, str):
        return redact(value)[0]
    if isinstance(value, dict):
        return {k: redact_payload(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [redact_payload(v) for v in value]
    return value


def check_input(text: str) -> GuardrailResult:
    if len(text) > MAX_INPUT_CHARS:
        return GuardrailResult(True, ["input_too_long"], f"Input longer than {MAX_INPUT_CHARS} characters")
    if INJECTION_RE.search(normalise(text)):
        return GuardrailResult(True, ["prompt_injection"], "Input looks like an attempt to override the agent's instructions")
    if _has_base64_block(_ZERO_WIDTH_RE.sub("", text)):
        return GuardrailResult(True, ["encoded_payload"], "Input contains a long encoded block that cannot be checked")
    return GuardrailResult()
