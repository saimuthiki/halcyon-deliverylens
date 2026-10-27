"""Tables. Column names mirror the CSVs in data/halcyon-dataset (see DATA_DICTIONARY.md)."""
from datetime import date, datetime, timezone

from sqlalchemy import JSON, Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Client(Base):
    __tablename__ = "clients"
    client_id: Mapped[str] = mapped_column(String(10), primary_key=True)
    client_name: Mapped[str] = mapped_column(String(100))
    region: Mapped[str] = mapped_column(String(20))
    primary_order_channel: Mapped[str] = mapped_column(String(10))
    account_tier: Mapped[str] = mapped_column(String(10))
    sla_penalty_clause: Mapped[str] = mapped_column(String(1))
    annual_revenue_usd: Mapped[int] = mapped_column(Integer)
    account_status: Mapped[str] = mapped_column(String(30), index=True)


class Carrier(Base):
    __tablename__ = "carriers"
    carrier_id: Mapped[str] = mapped_column(String(5), primary_key=True)
    carrier_name: Mapped[str] = mapped_column(String(100))
    has_api: Mapped[str] = mapped_column(String(1))
    delivery_event_feed: Mapped[str] = mapped_column(String(50))
    preferred_supplier_agreement: Mapped[str] = mapped_column(String(1))
    base_rate_usd: Mapped[float] = mapped_column(Float)


class Warehouse(Base):
    __tablename__ = "warehouses"
    warehouse_id: Mapped[str] = mapped_column(String(5), primary_key=True)
    warehouse_name: Mapped[str] = mapped_column(String(100))
    region: Mapped[str] = mapped_column(String(20))
    pick_list_cutoff: Mapped[str] = mapped_column(String(5))
    carrier_collection_window: Mapped[str] = mapped_column(String(20))


class WarehouseRegionDistance(Base):
    __tablename__ = "warehouse_region_distance_miles"
    warehouse_id: Mapped[str] = mapped_column(ForeignKey("warehouses.warehouse_id"), primary_key=True)
    Midwest: Mapped[int] = mapped_column(Integer)
    Southeast: Mapped[int] = mapped_column(Integer)
    Northeast: Mapped[int] = mapped_column(Integer)
    West: Mapped[int] = mapped_column(Integer)


class Delivery(Base):
    __tablename__ = "deliveries"
    delivery_id: Mapped[str] = mapped_column(String(10), primary_key=True)
    order_id: Mapped[str] = mapped_column(String(20), index=True)  # not unique: 21 duplicates in source
    client_id: Mapped[str] = mapped_column(ForeignKey("clients.client_id"), index=True)
    order_channel: Mapped[str] = mapped_column(String(10))
    email_format_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    order_received_ts: Mapped[datetime] = mapped_column(DateTime)
    commitment_type: Mapped[str] = mapped_column(String(10))
    promised_date: Mapped[date] = mapped_column(Date)
    address_status: Mapped[str] = mapped_column(String(10))
    pick_list_date: Mapped[date] = mapped_column(Date)
    shipped_ts: Mapped[datetime] = mapped_column(DateTime)
    destination_region: Mapped[str] = mapped_column(String(20))
    nearest_warehouse_id: Mapped[str] = mapped_column(ForeignKey("warehouses.warehouse_id"))
    fulfilment_warehouse_id: Mapped[str] = mapped_column(ForeignKey("warehouses.warehouse_id"))
    nearest_warehouse_had_stock: Mapped[str] = mapped_column(String(1))
    distance_miles: Mapped[int] = mapped_column(Integer)
    carrier_id: Mapped[str] = mapped_column(ForeignKey("carriers.carrier_id"), index=True)
    carrier_rate_usd: Mapped[float] = mapped_column(Float)
    stops_on_route: Mapped[int] = mapped_column(Integer)
    planned_route_km: Mapped[float] = mapped_column(Float)
    actual_route_km: Mapped[float | None] = mapped_column(Float, nullable=True)
    delivered_date: Mapped[date] = mapped_column(Date)
    days_late: Mapped[int] = mapped_column(Integer)
    on_time: Mapped[str] = mapped_column(String(1))
    redelivery_cost_usd: Mapped[float] = mapped_column(Float)


class SlaPenalty(Base):
    __tablename__ = "sla_penalties"
    penalty_id: Mapped[str] = mapped_column(String(12), primary_key=True)
    delivery_id: Mapped[str] = mapped_column(ForeignKey("deliveries.delivery_id"), index=True)
    client_id: Mapped[str] = mapped_column(ForeignKey("clients.client_id"))
    days_late: Mapped[int] = mapped_column(Integer)
    penalty_usd: Mapped[float] = mapped_column(Float)


class Complaint(Base):
    __tablename__ = "complaints"
    complaint_id: Mapped[str] = mapped_column(String(10), primary_key=True)
    complaint_date: Mapped[date] = mapped_column(Date)
    client_id: Mapped[str] = mapped_column(ForeignKey("clients.client_id"), index=True)
    delivery_id: Mapped[str] = mapped_column(ForeignKey("deliveries.delivery_id"))
    channel: Mapped[str] = mapped_column(String(20))
    category: Mapped[str] = mapped_column(String(50))
    escalated_to_account_owner: Mapped[str] = mapped_column(String(1))
    text: Mapped[str] = mapped_column(Text)


class CustomerSuccessTimeStudy(Base):
    __tablename__ = "customer_success_time_study"
    staff_id: Mapped[str] = mapped_column(String(10), primary_key=True)
    week_of: Mapped[date] = mapped_column(Date, primary_key=True)
    hours_total: Mapped[float] = mapped_column(Float)
    hours_on_delivery_complaints: Mapped[float] = mapped_column(Float)
    hours_keying_email_orders: Mapped[float] = mapped_column(Float)
    hours_on_proactive_client_work: Mapped[float] = mapped_column(Float)


class AgentRun(Base):
    __tablename__ = "agent_runs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    agent: Mapped[str] = mapped_column(String(40), index=True)
    provider: Mapped[str] = mapped_column(String(20))
    model: Mapped[str] = mapped_column(String(200))
    latency_ms: Mapped[int] = mapped_column(Integer)
    input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0)
    guardrail_flags: Mapped[list] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(20), default="ok")
    input_text: Mapped[str] = mapped_column(Text, default="")   # redacted
    output_text: Mapped[str] = mapped_column(Text, default="")  # redacted
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)


class InboxMessage(Base):
    """One email in the shared order inbox (data/sample-inbox). received_at is warehouse-local time."""
    __tablename__ = "inbox_messages"
    id: Mapped[str] = mapped_column(String(20), primary_key=True)
    file: Mapped[str] = mapped_column(String(200))
    from_name: Mapped[str] = mapped_column(String(200), default="")
    from_email: Mapped[str] = mapped_column(String(200), default="")
    client_id: Mapped[str | None] = mapped_column(String(10), nullable=True)  # from the manifest (for checking)
    subject: Mapped[str] = mapped_column(String(300), default="")
    received_at: Mapped[datetime] = mapped_column(DateTime)
    body: Mapped[str] = mapped_column(Text, default="")
    attachments_json: Mapped[list] = mapped_column(JSON, default=list)  # [{filename, content_type, text}]
    scenario: Mapped[str] = mapped_column(String(200), default="")
    expected_decision: Mapped[str] = mapped_column(String(20), default="")
    what_it_demonstrates: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="new")  # new | processed
    decision: Mapped[str | None] = mapped_column(String(20), nullable=True)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class WmsOrder(Base):
    """The order as the warehouse system would receive it (one per processed, non-blocked email)."""
    __tablename__ = "wms_orders"
    wms_order_id: Mapped[str] = mapped_column(String(30), primary_key=True)
    message_id: Mapped[str] = mapped_column(String(20), index=True)
    client_id: Mapped[str | None] = mapped_column(String(10), nullable=True)
    client_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    ship_to_json: Mapped[dict] = mapped_column(JSON, default=dict)
    lines_json: Mapped[list] = mapped_column(JSON, default=list)
    commitment_type: Mapped[str | None] = mapped_column(String(10), nullable=True)
    requested_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    promised_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    destination_region: Mapped[str | None] = mapped_column(String(20), nullable=True)
    nearest_warehouse_id: Mapped[str | None] = mapped_column(String(5), nullable=True)
    fulfilment_warehouse_id: Mapped[str | None] = mapped_column(String(5), nullable=True)
    carrier_id: Mapped[str | None] = mapped_column(String(5), nullable=True)
    carrier_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    # awaiting_approval -> (a person approves) -> ready_for_pick_list | on_hold_missing_address | needs_review
    status: Mapped[str] = mapped_column(String(30))
    pick_list_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ClientAddress(Base):
    """A delivery address learned from an order that passed the address check (the seed history is a CSV)."""
    __tablename__ = "client_addresses"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    client_id: Mapped[str] = mapped_column(String(10), index=True)
    site_name: Mapped[str] = mapped_column(String(200), default="")
    street: Mapped[str] = mapped_column(String(200))
    city: Mapped[str] = mapped_column(String(100))
    state: Mapped[str] = mapped_column(String(10))
    postcode: Mapped[str] = mapped_column(String(20))
    source_message_id: Mapped[str | None] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class AddressConfirmation(Base):
    """An address filled from the client's history, waiting for the client to confirm it (link or reply)."""
    __tablename__ = "address_confirmations"
    message_id: Mapped[str] = mapped_column(String(20), primary_key=True)
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    client_id: Mapped[str] = mapped_column(String(10))
    suggested_json: Mapped[dict] = mapped_column(JSON, default=dict)
    missing_json: Mapped[list] = mapped_column(JSON, default=list)
    final_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # the address the client confirmed
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending | confirmed | corrected | unclear
    channel: Mapped[str | None] = mapped_column(String(20), nullable=True)  # link | reply
    reply_text: Mapped[str | None] = mapped_column(Text, nullable=True)  # redacted
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


# CSV file -> model, in foreign-key-safe insert order.
CSV_TABLES = [
    ("clients.csv", Client),
    ("carriers.csv", Carrier),
    ("warehouses.csv", Warehouse),
    ("warehouse_region_distance_miles.csv", WarehouseRegionDistance),
    ("deliveries.csv", Delivery),
    ("sla_penalties.csv", SlaPenalty),
    ("complaints.csv", Complaint),
    ("customer_success_time_study.csv", CustomerSuccessTimeStudy),
]
