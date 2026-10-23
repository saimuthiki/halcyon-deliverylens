"""Simple, deterministic guardrails around the AI agents.

- redact(): mask emails and phone numbers before text is logged.
- check_input(): block obvious prompt-injection phrases and oversized input.
"""
import re
from dataclasses import dataclass, field

MAX_INPUT_CHARS = 20000

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
# Needs separators between groups so postcodes, dates and SKUs are left alone.
PHONE_RE = re.compile(r"(?<!\w)(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{3}\)\s?|\d{3}[\s.-])\d{3}[\s.-]\d{4}(?!\w)")

INJECTION_PATTERNS = [
    r"ignore\s+(?:all\s+|any\s+)?(?:the\s+)?(?:previous|prior|above|earlier)\s+(?:instructions|prompts?|rules)",
    r"disregard\s+(?:all\s+|any\s+)?(?:the\s+)?(?:previous|prior|above|your)\s+(?:instructions|prompts?|rules)",
    r"forget\s+(?:all\s+)?(?:your|previous|prior)\s+(?:instructions|rules)",
    r"(?:reveal|show|print|repeat)\s+(?:me\s+)?(?:your|the)\s+(?:system\s+)?prompt",
    r"\bsystem\s+prompt\b",
    r"you\s+are\s+now\s+(?:a|an|in)\b",
    r"\bdeveloper\s+mode\b",
    r"\bjailbreak\b",
    r"\bDAN\s+mode\b",
    r"</?\s*(?:system|assistant|instructions?)\s*>",
]
INJECTION_RE = re.compile("|".join(INJECTION_PATTERNS), re.IGNORECASE)


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


def check_input(text: str) -> GuardrailResult:
    if len(text) > MAX_INPUT_CHARS:
        return GuardrailResult(True, ["input_too_long"], f"Input longer than {MAX_INPUT_CHARS} characters")
    if INJECTION_RE.search(text):
        return GuardrailResult(True, ["prompt_injection"], "Input looks like an attempt to override the agent's instructions")
    return GuardrailResult()
