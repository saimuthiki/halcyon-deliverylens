"""Settings read from environment variables (see .env.example)."""
import os
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

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
    )
