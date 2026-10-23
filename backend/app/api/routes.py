"""All /api endpoints."""
from fastapi import APIRouter, Query
from sqlalchemy import func, select, text

from app.agents.ask import run_ask
from app.agents.delay_alert import run_delay_alert
from app.agents.order_intake import run_order_intake
from app.storage import archive_json
from app.analytics import views
from app.analytics.causes import CAUSES
from app.analytics.simulator import simulate
from app.analytics.store import get_dataset
from app.analytics.vendor import vendor_assessment
from app.api.errors import ApiError
from app.api.schemas import AskRequest, DelayAlertRequest, OrderIntakeRequest, SimulateRequest
from app.config import get_settings
from app.db import get_engine, get_session
from app.models import AgentRun, Delivery

router = APIRouter(prefix="/api")


@router.get("/health", tags=["meta"])
def health():
    db_ok, deliveries = True, 0
    try:
        with get_engine().connect() as conn:
            conn.execute(text("SELECT 1"))
            deliveries = conn.execute(select(func.count()).select_from(Delivery)).scalar_one()
    except Exception:
        db_ok = False
    s = get_settings()
    return {"status": "ok" if db_ok else "degraded", "db_ok": db_ok, "deliveries_loaded": deliveries,
            "llm_provider": s.llm_provider}


@router.get("/kpis", tags=["analytics"])
def kpis():
    return views.kpis(get_dataset())


@router.get("/causes", tags=["analytics"])
def causes():
    return views.causes_view(get_dataset())


@router.get("/causes/{cause}/deliveries", tags=["analytics"])
def cause_deliveries(cause: str, limit: int = Query(50, ge=1, le=500)):
    if cause not in CAUSES:
        raise ApiError(404, f"Unknown cause {cause!r}", details={"valid": list(CAUSES)})
    return views.cause_deliveries(get_dataset(), cause, limit)


@router.get("/deliveries/{delivery_id}", tags=["analytics"])
def delivery(delivery_id: str):
    out = views.delivery_detail(get_dataset(), delivery_id)
    if out is None:
        raise ApiError(404, f"Delivery {delivery_id!r} not found")
    return out


@router.get("/carriers/scorecard", tags=["analytics"])
def carrier_scorecard():
    return views.carrier_scorecard(get_dataset())


@router.get("/clients/at-risk", tags=["analytics"])
def clients_at_risk():
    return views.at_risk_clients(get_dataset())


@router.post("/simulate", tags=["analytics"])
def simulate_fixes(body: SimulateRequest):
    return simulate(get_dataset(), body.fixes)


@router.get("/vendor-assessment", tags=["analytics"])
def vendor():
    return vendor_assessment(get_dataset())


@router.post("/agents/order-intake", tags=["agents"])
def order_intake(body: OrderIntakeRequest):
    result = run_order_intake(body.email_text, body.received_at)
    run_id = result.get("agent_run_id") if isinstance(result, dict) else None
    uri = archive_json("inbox", f"order-intake-{run_id or 'run'}",
                       {"email_text": body.email_text, "result": result})
    if isinstance(result, dict):
        result["archived_to"] = uri
    return result


@router.post("/agents/delay-alert", tags=["agents"])
def delay_alert(body: DelayAlertRequest):
    ds = get_dataset()
    if body.delivery_id not in ds.by_id.index:
        raise ApiError(404, f"Delivery {body.delivery_id!r} not found")
    return run_delay_alert(ds, body.delivery_id)


@router.post("/agents/ask", tags=["agents"])
def ask(body: AskRequest):
    return run_ask(get_dataset(), body.question)


@router.get("/agents/runs", tags=["agents"])
def agent_runs(limit: int = Query(50, ge=1, le=500)):
    with get_session() as s:
        rows = s.scalars(select(AgentRun).order_by(AgentRun.id.desc()).limit(limit)).all()
        return {"runs": [{
            "id": r.id, "agent": r.agent, "provider": r.provider, "model": r.model, "status": r.status,
            "latency_ms": r.latency_ms, "input_tokens": r.input_tokens, "output_tokens": r.output_tokens,
            "tokens": r.input_tokens + r.output_tokens, "guardrail_flags": r.guardrail_flags or [],
            "created_at": r.created_at.isoformat() if r.created_at else None,
        } for r in rows]}
