"""All /api endpoints."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select, text

from app.agents.account_plan import NotAtRisk, run_account_plan
from app.agents.ask import run_ask
from app.agents.carrier_claims import NothingToClaim, UnknownCarrier, claims_summary, run_carrier_claim
from app.agents.morning_note import run_morning_note
from app.agents.delay_alert import run_delay_alert
from app.agents.llm_client import LLMClient
from app.agents.order_intake import run_order_intake
from app.agents.weekly_brief import NotConfigured, UnknownWeek, available_weeks, run_weekly_brief, send_brief
from app.desk import address_book
from app.desk.inbox import message_detail, message_summary
from app.desk.pipeline import (AlreadyApproved, MessageNotFound, NotAwaitingApproval, approve_all, approve_order,
                               process_all, process_message, reset_desk, wms_order_dict)
from app.guardrails import redact_payload
from app.storage import archive_json
from app.analytics import views
from app.analytics.causes import CAUSES
from app.analytics.late_orders import simulate_late_orders
from app.analytics.risk_board import UnknownDay, backtest, risk_board
from app.analytics.roi import roi_view
from app.analytics.simulator import simulate
from app.analytics.store import get_dataset
from app.analytics.vendor import vendor_assessment
from app.api.errors import ApiError
from app.api.security import agent_guard
from app.api.schemas import (AccountPlanRequest, AskRequest, CarrierClaimRequest, ClientReplyRequest, DelayAlertRequest,
                             LateOrdersRequest, MorningNoteRequest, OrderIntakeRequest, SimulateRequest,
                             WeeklyBriefRequest, WeeklyBriefSendRequest)
from app.email import EmailDeliveryError
from app.email.dedupe import AlreadySent
from app.config import get_settings
from app.db import get_engine, get_session
from app.models import AgentRun, Delivery, InboxMessage, WmsOrder

router = APIRouter(prefix="/api")
AGENT_GUARD = [Depends(agent_guard)]  # rate limit + optional demo token on /api/agents/* and desk POSTs


@router.get("/health", tags=["meta"])
def health():
    db_ok, deliveries = True, 0
    try:
        with get_engine().connect() as conn:
            conn.execute(text("SELECT 1"))
            deliveries = conn.execute(select(func.count()).select_from(Delivery)).scalar_one()
    except Exception:
        db_ok = False
    try:
        llm = LLMClient()
        provider, model, ready = llm.provider, llm.model_for("fast"), llm.ready()
    except ValueError:  # unknown LLM_PROVIDER
        provider, model, ready = get_settings().llm_provider, None, False
    return {"status": "ok" if db_ok else "degraded", "db_ok": db_ok, "deliveries_loaded": deliveries,
            "llm_provider": provider, "llm_model": model, "llm_ready": ready}


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


@router.get("/roi", tags=["analytics"])
def roi():
    return roi_view(get_dataset())


@router.get("/stock/placement", tags=["analytics"])
def stock_placement():
    return views.stock_placement(get_dataset())


@router.get("/routes/deviation", tags=["analytics"])
def route_deviation():
    return views.route_deviation(get_dataset())


@router.post("/simulate", tags=["analytics"])
def simulate_fixes(body: SimulateRequest):
    return simulate(get_dataset(), body.fixes)


@router.post("/simulate/late-orders", tags=["analytics"])
def simulate_late(body: LateOrdersRequest | None = None):
    body = body or LateOrdersRequest()
    s = get_settings()
    return {**simulate_late_orders(get_dataset(), body.grace_until, body.hard_stop),
            "order_desk_settings": {"grace_until": s.same_day_grace_until, "hard_stop": s.same_day_hard_stop}}


@router.get("/vendor-assessment", tags=["analytics"])
def vendor():
    return vendor_assessment(get_dataset())


@router.post("/agents/order-intake", tags=["agents"], dependencies=AGENT_GUARD)
def order_intake(body: OrderIntakeRequest):
    result = run_order_intake(body.email_text, body.received_at)
    run_id = result.get("agent_run_id") if isinstance(result, dict) else None
    uri = archive_json("inbox", f"order-intake-{run_id or 'run'}",
                       redact_payload({"email_text": body.email_text, "result": result}))
    if isinstance(result, dict):
        result["archived_to"] = uri
    return result


@router.post("/agents/delay-alert", tags=["agents"], dependencies=AGENT_GUARD)
def delay_alert(body: DelayAlertRequest):
    ds = get_dataset()
    if body.delivery_id not in ds.by_id.index:
        raise ApiError(404, f"Delivery {body.delivery_id!r} not found")
    return run_delay_alert(ds, body.delivery_id)


@router.post("/agents/ask", tags=["agents"], dependencies=AGENT_GUARD)
def ask(body: AskRequest):
    return run_ask(get_dataset(), body.question)


@router.get("/carriers/claims", tags=["analytics"])
def carrier_claims():
    """SLA penalties Halcyon paid for delays the carrier alone caused, per carrier."""
    return claims_summary(get_dataset())


@router.post("/agents/carrier-claim", tags=["agents"], dependencies=AGENT_GUARD)
def carrier_claim(body: CarrierClaimRequest):
    """Carrier Claims Agent: the claim pack and a draft claim letter for one carrier (nothing is sent)."""
    try:
        return run_carrier_claim(get_dataset(), body.carrier_id, body.month)
    except UnknownCarrier:
        raise ApiError(404, f"Carrier {body.carrier_id!r} not found") from None
    except NothingToClaim:
        raise ApiError(404, f"Nothing to claim from carrier {body.carrier_id}"
                            + (f" for {body.month}" if body.month else "")) from None


@router.get("/risk-board", tags=["analytics"])
def get_risk_board(day: str | None = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
                   warehouse: str | None = Query(None, pattern=r"^W\d$"),
                   limit: int = Query(20, ge=1, le=100), sort: str = Query("risk", pattern="^(risk|money)$")):
    """Morning risk board: today's pick list scored for late risk from history, with the fixes still possible."""
    try:
        return risk_board(get_dataset(), day, warehouse, limit, sort)
    except UnknownDay:
        raise ApiError(404, f"No risk board for {day}") from None


@router.get("/risk-board/backtest", tags=["analytics"])
def get_risk_backtest():
    return backtest(get_dataset())


@router.post("/agents/morning-note", tags=["agents"], dependencies=AGENT_GUARD)
def morning_note(body: MorningNoteRequest | None = None):
    """Morning Note Agent: the 08:00 huddle message from the risk board."""
    try:
        return run_morning_note(get_dataset(), body.day if body else None, body.warehouse if body else None)
    except UnknownDay:
        raise ApiError(404, f"No risk board for {body.day}") from None


@router.post("/agents/account-plan", tags=["agents"], dependencies=AGENT_GUARD)
def account_plan(body: AccountPlanRequest):
    """Account Save Agent: a save plan for one of the clients threatening to leave (a draft, nothing is sent)."""
    try:
        return run_account_plan(get_dataset(), body.client_id)
    except NotAtRisk:
        raise ApiError(422, f"Client {body.client_id!r} is not one of the clients threatening to leave") from None
    except KeyError:
        raise ApiError(404, f"Client {body.client_id!r} not found") from None


@router.get("/briefs/weeks", tags=["agents"])
def brief_weeks():
    weeks = available_weeks(get_dataset())
    return {"weeks": weeks, "latest": weeks[-1]}


@router.post("/agents/weekly-brief", tags=["agents"], dependencies=AGENT_GUARD)
def weekly_brief(body: WeeklyBriefRequest | None = None):
    """Weekly Brief Agent: the one-page Monday email to the COO and CFO (preview)."""
    try:
        return run_weekly_brief(get_dataset(), body.week_of if body else None)
    except UnknownWeek:
        raise ApiError(404, f"No deliveries in the week of {body.week_of}") from None


@router.post("/briefs/weekly/send", tags=["agents"], dependencies=AGENT_GUARD)
def weekly_brief_send(body: WeeklyBriefSendRequest | None = None):
    """Send the brief now to the server's recipients (never to an address from the request). Once per reporting
    week per day; `resend` sends again on purpose and needs the server's DEMO_TOKEN."""
    resend = bool(body and body.resend)
    if resend and not get_settings().demo_token:  # with a token set, agent_guard has already checked it
        raise ApiError(403, "Resending needs a DEMO_TOKEN on the server; or run "
                            "`python -m app.agents.weekly_brief send --resend` on the server")
    try:
        result = run_weekly_brief(get_dataset(), body.week_of if body else None)
        return {**send_brief(result, resend=resend), "brief": result["brief"],
                "guardrail_flags": result["guardrail_flags"]}
    except UnknownWeek:
        raise ApiError(404, f"No deliveries in the week of {body.week_of}") from None
    except NotConfigured as e:
        raise ApiError(409, f"Email sending is not set up on this server ({e})") from None
    except AlreadySent as e:
        when = f" at {e.at:%H:%M} UTC" if e.at else ""
        raise ApiError(409, f"This week's brief was already {e.status} today{when}; it is sent once a day",
                       code="already_sent", details={"status": e.status}) from None
    except EmailDeliveryError as e:  # the message carries the error class and code only
        raise ApiError(502, str(e), code="email_not_sent",
                       details={"outcome_unknown": getattr(e, "outcome_unknown", False)}) from None


@router.get("/agents/runs", tags=["agents"], dependencies=AGENT_GUARD)
def agent_runs(limit: int = Query(50, ge=1, le=500)):
    with get_session() as s:
        rows = s.scalars(select(AgentRun).order_by(AgentRun.id.desc()).limit(limit)).all()
        return {"runs": [{
            "id": r.id, "agent": r.agent, "provider": r.provider, "model": r.model, "status": r.status,
            "latency_ms": r.latency_ms, "input_tokens": r.input_tokens, "output_tokens": r.output_tokens,
            "tokens": r.input_tokens + r.output_tokens, "guardrail_flags": r.guardrail_flags or [],
            "created_at": r.created_at.isoformat() if r.created_at else None,
        } for r in rows]}


# ---------------------------------------------------------------- Order desk
@router.get("/desk/inbox", tags=["desk"])
def desk_inbox():
    with get_session() as s:
        rows = s.scalars(select(InboxMessage).order_by(InboxMessage.id)).all()
        return {"messages": [message_summary(m) for m in rows]}


@router.get("/desk/inbox/{message_id}", tags=["desk"])
def desk_message(message_id: str):
    with get_session() as s:
        m = s.get(InboxMessage, message_id)
        if m is None:
            raise ApiError(404, f"Message {message_id!r} not found")
        return message_detail(m)


@router.post("/desk/process-all", tags=["desk"], dependencies=AGENT_GUARD)
def desk_process_all():
    return process_all()


@router.post("/desk/process/{message_id}", tags=["desk"], dependencies=AGENT_GUARD)
def desk_process(message_id: str):
    try:
        return process_message(message_id)
    except MessageNotFound:
        raise ApiError(404, f"Message {message_id!r} not found") from None
    except AlreadyApproved:
        raise ApiError(409, "Already approved into the WMS; reset the demo to run it again") from None


@router.get("/desk/wms-orders", tags=["desk"])
def desk_wms_orders():
    with get_session() as s:
        rows = s.scalars(select(WmsOrder).order_by(WmsOrder.message_id)).all()
        return {"orders": [wms_order_dict(o) for o in rows]}


@router.post("/desk/approve-all", tags=["desk"], dependencies=AGENT_GUARD)
def desk_approve_all():
    """A person approves every accepted order waiting for approval into the WMS."""
    return approve_all()


@router.post("/desk/approve/{message_id}", tags=["desk"], dependencies=AGENT_GUARD)
def desk_approve(message_id: str):
    """A person approves one accepted order: awaiting_approval -> ready_for_pick_list."""
    try:
        return {"wms_order": approve_order(message_id)}
    except MessageNotFound:
        raise ApiError(404, f"No WMS order for message {message_id!r}") from None
    except NotAwaitingApproval as e:
        raise ApiError(409, f"WMS order for {message_id!r} is {e.args[0]}, not awaiting approval") from None


@router.get("/desk/confirm/{token}", tags=["desk"])
def desk_confirmation(token: str):
    """What the client's one-click confirmation page shows."""
    view = address_book.confirmation_view(token)
    if view is None:
        raise ApiError(404, "This confirmation link is not valid")
    return view


@router.post("/desk/confirm/{token}", tags=["desk"], dependencies=AGENT_GUARD)
def desk_confirm(token: str):
    """The client confirms the address on file with one click; the order is processed again with it."""
    try:
        mid = address_book.confirm_by_link(token)
    except address_book.ConfirmationNotFound:
        raise ApiError(404, "This confirmation link is not valid") from None
    return {"confirmation": address_book.confirmation_view(token), "trace": _reprocess(mid)}


@router.post("/desk/reply/{message_id}", tags=["desk"], dependencies=AGENT_GUARD)
def desk_reply(message_id: str, body: ClientReplyRequest):
    """The client's reply to the address confirmation email, read by the Reply Reader Agent."""
    try:
        result = address_book.read_reply(message_id, body.text)
    except address_book.ConfirmationNotFound:
        raise ApiError(404, f"No address confirmation is waiting for message {message_id!r}") from None
    trace = _reprocess(message_id) if result["outcome"] in ("confirmed", "corrected") else None
    return {"reply": result, "trace": trace}


def _reprocess(message_id: str) -> dict | None:
    try:
        return process_message(message_id)
    except AlreadyApproved:
        return None


@router.post("/desk/reset", tags=["desk"], dependencies=AGENT_GUARD)
def desk_reset():
    return reset_desk()
