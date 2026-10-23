"""Read the tables once into pandas, tag causes, and cache everything in-process."""
import threading
from dataclasses import dataclass

import pandas as pd

from app.analytics.causes import tag_causes
from app.analytics.combos import ComboModel
from sqlalchemy import select

from app import models  # noqa: F401  (registers tables)
from app.db import Base, get_engine

DATE_COLS = {"promised_date", "pick_list_date", "delivered_date", "complaint_date", "week_of"}
TS_COLS = {"order_received_ts", "shipped_ts"}


class DataNotLoaded(RuntimeError):
    pass


@dataclass
class Dataset:
    deliveries: pd.DataFrame
    clients: pd.DataFrame
    carriers: pd.DataFrame
    warehouses: pd.DataFrame
    penalties: pd.DataFrame
    complaints: pd.DataFrame
    time_study: pd.DataFrame
    combos: ComboModel
    findings: dict
    by_id: pd.DataFrame  # deliveries indexed by delivery_id

    @property
    def at_risk_client_ids(self) -> set[str]:
        return set(self.clients.loc[self.clients.account_status == "threatening_to_leave", "client_id"])


_lock = threading.Lock()
_cache: Dataset | None = None


def _read(conn, table: str, order_by: str) -> pd.DataFrame:
    t = Base.metadata.tables[table]
    df = pd.read_sql_query(select(t).order_by(t.c[order_by]), conn)
    for col in df.columns:
        if col in DATE_COLS or col in TS_COLS:
            df[col] = pd.to_datetime(df[col])
    return df


def build_dataset() -> Dataset:
    from app.analytics.findings import compute_findings

    with get_engine().connect() as conn:
        deliveries = _read(conn, "deliveries", "delivery_id")
        if deliveries.empty:
            raise DataNotLoaded("No deliveries in the database. Run: python -m app.loader")
        frames = dict(
            clients=_read(conn, "clients", "client_id"),
            carriers=_read(conn, "carriers", "carrier_id"),
            warehouses=_read(conn, "warehouses", "warehouse_id"),
            penalties=_read(conn, "sla_penalties", "penalty_id"),
            complaints=_read(conn, "complaints", "complaint_id"),
            time_study=_read(conn, "customer_success_time_study", "staff_id"),
        )
    deliveries = tag_causes(deliveries)
    penalty_by_delivery = frames["penalties"].groupby("delivery_id").penalty_usd.sum()
    deliveries["penalty_usd"] = deliveries.delivery_id.map(penalty_by_delivery).fillna(0.0)
    ds = Dataset(deliveries=deliveries, combos=ComboModel(deliveries), findings={},
                 by_id=deliveries.set_index("delivery_id", drop=False), **frames)
    ds.findings = compute_findings(ds)
    return ds


def get_dataset() -> Dataset:
    global _cache
    if _cache is None:
        with _lock:
            if _cache is None:
                _cache = build_dataset()
    return _cache


def reset_cache() -> None:
    global _cache
    with _lock:
        _cache = None
