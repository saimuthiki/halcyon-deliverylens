"""Database engine and session. Works with SQLite (local) and PostgreSQL (RDS)."""
from functools import lru_cache

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import Engine
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import DeclarativeBase, Session

from app.config import get_settings


class Base(DeclarativeBase):
    pass


def normalise_url(url: str) -> str:
    """Accept postgres:// and postgresql:// and use the psycopg (v3) driver for them."""
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix):]
    return url


@lru_cache
def get_engine() -> Engine:
    url = normalise_url(get_settings().database_url)
    kwargs = {"pool_pre_ping": True}
    if url.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False}
    return create_engine(url, **kwargs)


def get_session() -> Session:
    return Session(get_engine())


def init_db() -> None:
    from app import models  # noqa: F401  (registers tables)

    Base.metadata.create_all(get_engine())
    ensure_columns(get_engine())


# Columns added after the first deploy. create_all() never alters an existing table, so add them here
# (nullable, so the ALTER is safe on SQLite and PostgreSQL and needs no backfill). Type per dialect.
ADDED_COLUMNS = {"wms_orders": {"approved_at": {"postgresql": "TIMESTAMP WITH TIME ZONE", "default": "TIMESTAMP"}}}


def add_column_sql(dialect: str, table: str, name: str) -> str:
    types = ADDED_COLUMNS[table][name]
    if dialect == "postgresql":  # IF NOT EXISTS: two app instances starting at once both succeed
        return f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {name} {types['postgresql']}"
    return f"ALTER TABLE {table} ADD COLUMN {name} {types['default']}"


def ensure_columns(engine: Engine) -> None:
    insp = inspect(engine)
    for table, cols in ADDED_COLUMNS.items():
        if not insp.has_table(table):
            continue
        have = {c["name"] for c in insp.get_columns(table)}
        for name in cols:
            if name in have:
                continue
            try:
                with engine.begin() as conn:
                    conn.execute(text(add_column_sql(engine.dialect.name, table, name)))
            except DBAPIError:
                # SQLite has no IF NOT EXISTS: another process may have added it first. Re-inspect.
                if name not in {c["name"] for c in inspect(engine).get_columns(table)}:
                    raise
