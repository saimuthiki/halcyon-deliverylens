"""Load the Halcyon CSVs into the database.

Usage:  python -m app.loader [--data-dir PATH] [--if-empty]

Idempotent: each run replaces the data tables in one transaction (agent_runs is untouched).
--if-empty skips the load when deliveries already has rows (used by infra/scripts/07-deploy.sh).
"""
import argparse
import logging
from pathlib import Path

import pandas as pd
from sqlalchemy import Date, DateTime, Float, Integer, delete, func, insert, inspect, select
from sqlalchemy.engine import Engine

from app.config import get_settings
from app.db import Base, get_engine
from app.models import CSV_TABLES, Delivery

log = logging.getLogger(__name__)


def _records(df: pd.DataFrame, model) -> list[dict]:
    out = df.copy()
    for col in model.__table__.columns:
        if col.name not in out:
            continue
        if isinstance(col.type, DateTime):
            out[col.name] = pd.to_datetime(out[col.name])
        elif isinstance(col.type, Date):
            out[col.name] = pd.to_datetime(out[col.name]).dt.date
    out = out.astype(object).where(out.notna(), None)
    records = out.to_dict(orient="records")
    # Convert numpy scalars / Timestamps into plain Python types for every DB driver.
    int_cols = {c.name for c in model.__table__.columns if isinstance(c.type, Integer)}
    float_cols = {c.name for c in model.__table__.columns if isinstance(c.type, Float)}
    dt_cols = {c.name for c in model.__table__.columns if isinstance(c.type, DateTime)}
    for r in records:
        for k, v in r.items():
            if v is None:
                continue
            if k in int_cols:
                r[k] = int(v)
            elif k in float_cols:
                r[k] = float(v)
            elif k in dt_cols:
                r[k] = v.to_pydatetime()
    return records


def load_all(engine: Engine | None = None, data_dir: Path | None = None) -> dict[str, int]:
    """Replace all data tables with the CSV contents. Returns row counts per table."""
    from app import models  # noqa: F401

    engine = engine or get_engine()
    data_dir = Path(data_dir or get_settings().data_dir)
    Base.metadata.create_all(engine)
    frames = {model: pd.read_csv(data_dir / name, dtype={"email_format_id": "Int64"})
              for name, model in CSV_TABLES}
    counts = {}
    with engine.begin() as conn:
        for _, model in reversed(CSV_TABLES):
            conn.execute(delete(model))
        for model, df in frames.items():
            rows = _records(df, model)
            for start in range(0, len(rows), 5000):
                conn.execute(insert(model), rows[start:start + 5000])
            counts[model.__tablename__] = len(rows)
    from app.analytics.store import reset_cache

    reset_cache()
    return counts


def is_loaded(engine: Engine | None = None) -> bool:
    engine = engine or get_engine()
    if not inspect(engine).has_table("deliveries"):
        return False
    with engine.connect() as conn:
        return conn.execute(select(func.count()).select_from(Delivery)).scalar_one() > 0


def main() -> None:
    parser = argparse.ArgumentParser(description="Load Halcyon CSVs into the DeliveryLens database")
    parser.add_argument("--data-dir", type=Path, default=None)
    parser.add_argument("--if-empty", action="store_true", help="only load when the deliveries table is empty")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    if args.if_empty and is_loaded():
        print("Data already loaded; skipping (--if-empty).")
        return
    counts = load_all(data_dir=args.data_dir)
    for table, n in counts.items():
        print(f"{table:40s} {n:>7d} rows")


if __name__ == "__main__":
    main()
