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
