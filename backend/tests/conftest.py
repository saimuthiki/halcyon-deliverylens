"""Shared fixtures: a throwaway DB loaded once per test session, mock LLM.

SQLite by default. Set TEST_DATABASE_URL (e.g. postgresql+psycopg://...) to run the suite against
PostgreSQL; the loader replaces the data tables there, so point it at a scratch database only.
"""
import os
import tempfile
from pathlib import Path

import pytest

_TMP = tempfile.mkdtemp(prefix="deliverylens-test-")
os.environ["DATABASE_URL"] = os.getenv("TEST_DATABASE_URL") or f"sqlite:///{Path(_TMP) / 'test.db'}"
os.environ["LLM_PROVIDER"] = "mock"
os.environ.setdefault("CORS_ORIGINS", "http://localhost:5173")
os.environ["AGENT_RATE_LIMIT_PER_MIN"] = "100000"  # the suite calls the agents many times; one test checks 429
os.environ["DEMO_TOKEN"] = ""  # empty = off; one test turns it on
os.environ.pop("S3_BUCKET", None)
os.environ.pop("APP_SECRET_ID", None)  # tests never read AWS Secrets Manager

# Never load a developer's backend/.env (it may hold real credentials): tests see only what they set themselves.
import app.config as _config  # noqa: E402

_config._load_dotenv = lambda: None

REPO_ROOT = Path(__file__).resolve().parents[2]
FINDINGS_PATH = REPO_ROOT / "analysis" / "output" / "findings.json"
SAMPLE_EMAILS = Path(__file__).resolve().parents[1] / "sample_emails"


@pytest.fixture(scope="session")
def loaded_db():
    from app.db import get_engine
    from app.loader import load_all

    counts = load_all(get_engine())
    return counts


def _clear_email_sends():
    from sqlalchemy import inspect, text

    from app.db import get_engine

    engine = get_engine()
    if inspect(engine).has_table("email_sends"):
        with engine.begin() as conn:
            conn.execute(text("DELETE FROM email_sends"))


@pytest.fixture(autouse=True)
def _fresh_email_sends():
    """An empty email send log for every test, so one test's Weekly Brief never blocks the next as a duplicate."""
    _clear_email_sends()
    yield
    _clear_email_sends()


@pytest.fixture(scope="session")
def dataset(loaded_db):
    from app.analytics.store import get_dataset

    return get_dataset()


@pytest.fixture(scope="session")
def client(loaded_db):
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as c:
        yield c
