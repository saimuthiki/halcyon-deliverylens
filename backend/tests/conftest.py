"""Shared fixtures: a throwaway SQLite DB loaded once per test session, mock LLM."""
import os
import tempfile
from pathlib import Path

import pytest

_TMP = tempfile.mkdtemp(prefix="deliverylens-test-")
os.environ["DATABASE_URL"] = f"sqlite:///{Path(_TMP) / 'test.db'}"
os.environ["LLM_PROVIDER"] = "mock"
os.environ.setdefault("CORS_ORIGINS", "http://localhost:5173")

REPO_ROOT = Path(__file__).resolve().parents[2]
FINDINGS_PATH = REPO_ROOT / "analysis" / "output" / "findings.json"
SAMPLE_EMAILS = Path(__file__).resolve().parents[1] / "sample_emails"


@pytest.fixture(scope="session")
def loaded_db():
    from app.db import get_engine
    from app.loader import load_all

    counts = load_all(get_engine())
    return counts


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
