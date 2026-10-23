"""Halcyon DeliveryLens API.  Run: uvicorn app.main:app --reload"""
import json
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import errors
from app.api.routes import router
from app.config import get_settings
from app.db import init_db



class _JsonFormatter(logging.Formatter):
    def format(self, record):
        out = {"ts": self.formatTime(record), "level": record.levelname, "logger": record.name,
               "msg": record.getMessage()}
        if record.exc_info:
            out["exc"] = self.formatException(record.exc_info)
        return json.dumps(out)


_handler = logging.StreamHandler()
if os.getenv("LOG_JSON", "").lower() in {"1", "true", "yes"}:
    _handler.setFormatter(_JsonFormatter())
else:
    _handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
logging.basicConfig(level=logging.INFO, handlers=[_handler])


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()  # creates missing tables (agent_runs etc.); data is loaded by `python -m app.loader`
    yield


app = FastAPI(title="Halcyon DeliveryLens API", version="1.0.0", lifespan=lifespan,
              description="Why Halcyon deliveries are late, what fixing each cause is worth, and AI agents that fix them.")
app.add_middleware(CORSMiddleware, allow_origins=get_settings().cors_origins, allow_credentials=False,
                   allow_methods=["GET", "POST", "OPTIONS"], allow_headers=["*"])
errors.install(app)
app.include_router(router)
