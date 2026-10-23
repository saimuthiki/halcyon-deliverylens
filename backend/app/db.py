"""Database engine and session. Works with SQLite (local) and PostgreSQL (RDS)."""
from functools import lru_cache

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
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
