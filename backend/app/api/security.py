"""Protection for /api/agents/*: a per-client-IP rate limit and an optional shared demo token.

The limiter is in memory, so with N worker processes the effective limit is N x the setting. That is
enough for a single-instance demo; use a shared store (e.g. Redis) or the proxy's limiter beyond that.
The client IP comes from the connection; uvicorn's --proxy-headers sets it from X-Forwarded-For when
the app runs behind a trusted proxy (see the Dockerfile).
"""
import hmac
import math
import threading
import time
from collections import deque

from fastapi import Request

from app.api.errors import ApiError
from app.config import get_settings

WINDOW_SECONDS = 60.0
MAX_TRACKED_CLIENTS = 10_000


class RateLimiter:
    """Sliding window: at most `limit` hits per key in the last WINDOW_SECONDS."""

    def __init__(self, clock=time.monotonic):
        self._clock = clock
        self._hits: dict[str, deque] = {}
        self._lock = threading.Lock()

    def allow(self, key: str, limit: int) -> tuple[bool, int]:
        """Record a hit for `key`. Returns (allowed, seconds until the next hit is allowed)."""
        now = self._clock()
        with self._lock:
            if len(self._hits) > MAX_TRACKED_CLIENTS:
                self._purge(now)
            hits = self._hits.setdefault(key, deque())
            while hits and now - hits[0] >= WINDOW_SECONDS:
                hits.popleft()
            if len(hits) >= limit:
                return False, max(1, math.ceil(WINDOW_SECONDS - (now - hits[0])))
            hits.append(now)
            return True, 0

    def _purge(self, now: float) -> None:
        for key in [k for k, h in self._hits.items() if not h or now - h[-1] >= WINDOW_SECONDS]:
            del self._hits[key]

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


limiter = RateLimiter()


def agent_guard(request: Request) -> None:
    """FastAPI dependency for every /api/agents/* route."""
    s = get_settings()
    if s.agent_rate_limit_per_min > 0:
        ip = request.client.host if request.client else "unknown"
        allowed, retry_after = limiter.allow(ip, s.agent_rate_limit_per_min)
        if not allowed:
            raise ApiError(429, "Too many agent requests from this address; try again shortly", code="rate_limited",
                           details={"limit_per_minute": s.agent_rate_limit_per_min,
                                    "retry_after_seconds": retry_after},
                           headers={"Retry-After": str(retry_after)})
    if s.demo_token and request.method == "POST":
        given = request.headers.get("X-Demo-Token", "")
        if not hmac.compare_digest(given.encode(), s.demo_token.encode()):
            raise ApiError(401, "Missing or wrong X-Demo-Token header", code="unauthorized")
