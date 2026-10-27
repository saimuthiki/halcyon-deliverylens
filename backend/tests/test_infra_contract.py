"""Things infra/ relies on: the loader's --if-empty flag and the RDS URL format."""
import subprocess
import sys


def test_postgres_urls_use_psycopg3():
    from app.db import normalise_url

    assert normalise_url("postgres://u:p@h:5432/db") == "postgresql+psycopg://u:p@h:5432/db"
    assert normalise_url("postgresql://u:p@h/db") == "postgresql+psycopg://u:p@h/db"
    assert normalise_url("postgresql+psycopg://u:p@h/db") == "postgresql+psycopg://u:p@h/db"
    assert normalise_url("sqlite:///./x.db") == "sqlite:///./x.db"


def test_loader_if_empty_skips_when_loaded(loaded_db):
    out = subprocess.run([sys.executable, "-m", "app.loader", "--if-empty"], capture_output=True, text=True,
                         check=True)
    assert "skipping" in out.stdout


def test_if_empty_refresh_creates_missing_inbox_tables(tmp_path):
    """A DB loaded before the Order desk existed has deliveries but no inbox / WMS tables."""
    from sqlalchemy import create_engine, inspect

    from app.loader import refresh_inbox
    from app.models import Delivery

    eng = create_engine(f"sqlite:///{tmp_path / 'old.db'}")
    Delivery.__table__.create(eng)
    assert not inspect(eng).has_table("inbox_messages")
    assert refresh_inbox(eng) > 0
    insp = inspect(eng)
    assert insp.has_table("inbox_messages") and insp.has_table("wms_orders")
    assert "approved_at" in {c["name"] for c in insp.get_columns("wms_orders")}
