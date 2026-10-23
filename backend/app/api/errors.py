"""One error shape for every endpoint: {"error": {"code", "message", "details"}}."""
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.agents.delay_alert import NotDelayed
from app.agents.llm_client import LLMError
from app.agents.order_intake import GuardrailBlocked
from app.analytics.store import DataNotLoaded

CODES = {400: "bad_request", 404: "not_found", 409: "conflict", 422: "validation_error",
         500: "internal_error", 502: "llm_error", 503: "unavailable"}


class ApiError(Exception):
    def __init__(self, status: int, message: str, code: str | None = None, details=None):
        self.status, self.message, self.code, self.details = status, message, code or CODES.get(status, "error"), details


def _body(code: str, message: str, details=None) -> dict:
    return {"error": {"code": code, "message": message, "details": details}}


def install(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api(_: Request, e: ApiError):
        return JSONResponse(_body(e.code, e.message, e.details), status_code=e.status)

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, e: StarletteHTTPException):
        return JSONResponse(_body(CODES.get(e.status_code, "error"), str(e.detail)), status_code=e.status_code)

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, e: RequestValidationError):
        details = [{"loc": list(err["loc"]), "msg": err["msg"]} for err in e.errors()]
        return JSONResponse(_body("validation_error", "Request is not valid", details), status_code=422)

    @app.exception_handler(GuardrailBlocked)
    async def _guard(_: Request, e: GuardrailBlocked):
        return JSONResponse(_body("guardrail_blocked", e.reason, {"flags": e.flags, "agent_run_id": e.run_id}),
                            status_code=400)

    @app.exception_handler(DataNotLoaded)
    async def _nodata(_: Request, e: DataNotLoaded):
        return JSONResponse(_body("data_not_loaded", str(e)), status_code=503)

    @app.exception_handler(NotDelayed)
    async def _notdelayed(_: Request, e: NotDelayed):
        return JSONResponse(_body("not_delayed", f"Delivery {e} was on time and had no risk factors"),
                            status_code=409)

    @app.exception_handler(LLMError)
    async def _llm(_: Request, e: LLMError):
        return JSONResponse(_body("llm_error", "The language model call failed", str(e)), status_code=502)
