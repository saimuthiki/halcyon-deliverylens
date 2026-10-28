"""Settings read from environment variables (see .env.example)."""
import os
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

from app.runtime_secrets import value as runtime_secret

BACKEND_DIR = Path(__file__).resolve().parents[1]
DEFAULT_DATA_DIR = BACKEND_DIR.parent / "data" / "halcyon-dataset"

# Placeholder only. Set BEDROCK_MODEL_FAST / BEDROCK_MODEL_SMART to real model or
# inference-profile IDs enabled in your AWS account.
PLACEHOLDER_MODEL_ID = "SET-ME-bedrock-model-id"
DEFAULT_GEMINI_MODEL = "gemini-2.5-flash"
DEFAULT_INBOX_DIR = BACKEND_DIR.parent / "data" / "sample-inbox"


def _load_dotenv() -> None:
    try:
        from dotenv import load_dotenv
    except ImportError:  # optional
        return
    load_dotenv(BACKEND_DIR / ".env", override=False)


def _csv(name: str) -> tuple[str, ...]:
    return tuple(v.strip() for v in os.getenv(name, "").split(",") if v.strip())


def _flag(name: str, default: bool) -> bool:
    raw = os.getenv(name, "").strip().lower()
    return default if not raw else raw in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    database_url: str
    data_dir: Path
    cors_origins: list[str] = field(default_factory=list)
    llm_provider: str = "mock"
    aws_region: str = "us-east-1"
    bedrock_model_fast: str = PLACEHOLDER_MODEL_ID
    bedrock_model_smart: str = PLACEHOLDER_MODEL_ID
    llm_timeout_seconds: int = 30
    warehouse_tz: str = "America/Chicago"
    agent_rate_limit_per_min: int = 30
    demo_token: str = ""
    gemini_api_key: str = field(default="", repr=False)  # secret: never printed or logged
    gemini_model: str = DEFAULT_GEMINI_MODEL
    inbox_dir: Path = DEFAULT_INBOX_DIR
    same_day_grace_until: str = "09:00"  # same-day orders after 08:00: all added until this time
    same_day_hard_stop: str = "10:00"  # then urgent orders only until this time; after it, tomorrow
    weekly_brief_topic_arn: str = ""  # SNS topic for the Monday brief; empty = preview only
    public_site_url: str = "http://localhost:5173"  # the web app, for links in client emails
    # Email (app/email). The backend decides how mail leaves: sns (today), console, memory; smtp is the next stage.
    email_backend: str = "sns"
    email_from_address: str = ""  # must be a sender verified and authenticated with the provider
    email_from_name: str = "DeliveryLens"
    email_reply_to: tuple[str, ...] = ()
    # Test mode: every email goes only to EMAIL_TEST_RECIPIENTS (Cc and Bcc dropped, subject marked [TEST]).
    # Applies to backends that address recipients; an SNS topic always goes to its confirmed subscribers.
    email_test_mode: bool = True
    email_test_recipients: tuple[str, ...] = ()
    weekly_brief_to: tuple[str, ...] = ()  # per environment; never taken from a web request
    weekly_brief_cc: tuple[str, ...] = ()
    weekly_brief_bcc: tuple[str, ...] = ()
    brevo_api_key: str = field(default="", repr=False)  # secret: EMAIL_BACKEND=brevo (Brevo HTTP API)
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_security: str = "starttls"  # starttls (587) or ssl (465)
    smtp_username: str = field(default="", repr=False)  # secret: from Secrets Manager, never logged
    smtp_password: str = field(default="", repr=False)  # secret: the provider's SMTP key
    smtp_timeout_seconds: int = 15
    smtp_max_retries: int = 2  # transient failures only, within a ~40 s budget


@lru_cache
def get_settings() -> Settings:
    _load_dotenv()
    origins = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000")
    return Settings(
        database_url=os.getenv("DATABASE_URL", "sqlite:///./deliverylens.db"),
        data_dir=Path(os.getenv("DATA_DIR", str(DEFAULT_DATA_DIR))),
        cors_origins=[o.strip() for o in origins.split(",") if o.strip()],
        llm_provider=os.getenv("LLM_PROVIDER", "mock").lower(),
        aws_region=os.getenv("AWS_REGION", "us-east-1"),
        bedrock_model_fast=os.getenv("BEDROCK_MODEL_FAST", PLACEHOLDER_MODEL_ID),
        bedrock_model_smart=os.getenv("BEDROCK_MODEL_SMART", PLACEHOLDER_MODEL_ID),
        llm_timeout_seconds=int(os.getenv("LLM_TIMEOUT_SECONDS", "30")),
        warehouse_tz=os.getenv("WAREHOUSE_TZ", "America/Chicago"),
        agent_rate_limit_per_min=int(os.getenv("AGENT_RATE_LIMIT_PER_MIN", "30")),
        demo_token=os.getenv("DEMO_TOKEN", ""),
        gemini_api_key=os.getenv("GEMINI_API_KEY", "").strip(),
        gemini_model=os.getenv("GEMINI_MODEL", "").strip() or DEFAULT_GEMINI_MODEL,
        inbox_dir=Path(os.getenv("INBOX_DIR", str(DEFAULT_INBOX_DIR))),
        same_day_grace_until=os.getenv("SAME_DAY_GRACE_UNTIL", "09:00").strip(),
        same_day_hard_stop=os.getenv("SAME_DAY_HARD_STOP", "10:00").strip(),
        weekly_brief_topic_arn=os.getenv("WEEKLY_BRIEF_TOPIC_ARN", "").strip(),
        public_site_url=(os.getenv("PUBLIC_SITE_URL", "").strip() or "http://localhost:5173").rstrip("/"),
        email_backend=os.getenv("EMAIL_BACKEND", "").strip().lower() or "sns",
        email_from_address=os.getenv("EMAIL_FROM_ADDRESS", "").strip(),
        email_from_name=os.getenv("EMAIL_FROM_NAME", "").strip() or "DeliveryLens",
        email_reply_to=_csv("EMAIL_REPLY_TO"),
        email_test_mode=_flag("EMAIL_TEST_MODE", True),
        email_test_recipients=_csv("EMAIL_TEST_RECIPIENTS"),
        weekly_brief_to=_csv("WEEKLY_BRIEF_TO"),
        weekly_brief_cc=_csv("WEEKLY_BRIEF_CC"),
        weekly_brief_bcc=_csv("WEEKLY_BRIEF_BCC"),
        brevo_api_key=os.getenv("BREVO_API_KEY", "").strip(),
        # SMTP_*: the environment, else the runtime secret (APP_SECRET_ID, read with boto3; see runtime_secrets.py)
        smtp_host=runtime_secret("SMTP_HOST").strip(),
        smtp_port=int(runtime_secret("SMTP_PORT", "587")),
        smtp_security=runtime_secret("SMTP_SECURITY").strip().lower() or "starttls",
        smtp_username=runtime_secret("SMTP_USERNAME").strip(),
        smtp_password=runtime_secret("SMTP_PASSWORD").strip(),
        smtp_timeout_seconds=int(os.getenv("SMTP_TIMEOUT_SECONDS", "15")),
        smtp_max_retries=int(os.getenv("SMTP_MAX_RETRIES", "2")),
    )
