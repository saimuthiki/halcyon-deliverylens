"""One small interface over two LLM providers.

LLM_PROVIDER=mock    (default) deterministic, offline; each agent supplies a `mock` function that
                     produces realistic output from the same inputs (used by tests and demos).
LLM_PROVIDER=bedrock Amazon Bedrock Converse API via boto3. Region from AWS_REGION; model IDs from
                     BEDROCK_MODEL_FAST / BEDROCK_MODEL_SMART.

Every call is logged to the agent_runs table with redacted text and guardrail flags.
"""
import json
import logging
import re
import time
from dataclasses import dataclass, field
from typing import Callable

from app.config import PLACEHOLDER_MODEL_ID, get_settings
from app.db import get_session
from app.guardrails import redact
from app.models import AgentRun

log = logging.getLogger(__name__)


@dataclass
class LLMResponse:
    text: str
    provider: str
    model: str
    input_tokens: int = 0
    output_tokens: int = 0
    latency_ms: int = 0
    run_id: int | None = None
    flags: list[str] = field(default_factory=list)


class LLMError(RuntimeError):
    pass


def _estimate_tokens(text: str) -> int:
    return max(1, len(text) // 4)


class LLMClient:
    def __init__(self, provider: str | None = None):
        s = get_settings()
        self.provider = (provider or s.llm_provider).lower()
        if self.provider not in {"mock", "bedrock"}:
            raise ValueError(f"Unknown LLM_PROVIDER {self.provider!r}; use 'mock' or 'bedrock'")
        self._bedrock = None

    def model_for(self, tier: str) -> str:
        s = get_settings()
        if self.provider == "mock":
            return f"mock-{tier}"
        return s.bedrock_model_smart if tier == "smart" else s.bedrock_model_fast

    # ------------------------------------------------------------------
    def generate(self, *, agent: str, system: str, prompt: str, mock: Callable[[], str],
                 tier: str = "fast", max_tokens: int = 1024, flags: list[str] | None = None) -> LLMResponse:
        """Run one completion and log it. `mock` builds the deterministic response for provider=mock."""
        model = self.model_for(tier)
        start = time.perf_counter()
        status = "ok"
        try:
            if self.provider == "mock":
                text = mock()
                in_tok, out_tok = _estimate_tokens(system + prompt), _estimate_tokens(text)
            else:
                text, in_tok, out_tok = self._converse(model, system, prompt, max_tokens)
        except Exception as exc:  # log the failure, then surface it
            status = "error"
            text, in_tok, out_tok = f"ERROR: {exc}", 0, 0
            raise LLMError(str(exc)) from exc
        finally:
            latency = int((time.perf_counter() - start) * 1000)
            red_in, f_in = redact(prompt)
            red_out, f_out = redact(text)
            all_flags = sorted(set((flags or []) + f_in + f_out))
            run_id = self._log(self.provider, agent, model, latency, in_tok, out_tok, all_flags, status, red_in, red_out)
        return LLMResponse(text=text, provider=self.provider, model=model, input_tokens=in_tok,
                           output_tokens=out_tok, latency_ms=latency, run_id=run_id, flags=all_flags)

    def _converse(self, model: str, system: str, prompt: str, max_tokens: int) -> tuple[str, int, int]:
        if model == PLACEHOLDER_MODEL_ID:
            raise LLMError("Set BEDROCK_MODEL_FAST and BEDROCK_MODEL_SMART to Bedrock model IDs")
        if self._bedrock is None:
            import boto3
            from botocore.config import Config

            s = get_settings()
            self._bedrock = boto3.client(
                "bedrock-runtime", region_name=s.aws_region,
                config=Config(read_timeout=s.llm_timeout_seconds, connect_timeout=5,
                              retries={"max_attempts": 3, "mode": "standard"}))
        resp = self._bedrock.converse(
            modelId=model,
            system=[{"text": system}],
            messages=[{"role": "user", "content": [{"text": prompt}]}],
            inferenceConfig={"maxTokens": max_tokens, "temperature": 0},
        )
        parts = resp["output"]["message"]["content"]
        text = "".join(p.get("text", "") for p in parts)
        usage = resp.get("usage", {})
        return text, int(usage.get("inputTokens", 0)), int(usage.get("outputTokens", 0))

    @staticmethod
    def _log(provider, agent, model, latency, in_tok, out_tok, flags, status, input_text, output_text) -> int | None:
        try:
            with get_session() as s:
                run = AgentRun(agent=agent, provider=provider, model=model,
                               latency_ms=latency, input_tokens=in_tok, output_tokens=out_tok,
                               guardrail_flags=flags, status=status,
                               input_text=input_text[:4000], output_text=output_text[:4000])
                s.add(run)
                s.commit()
                return run.id
        except Exception:  # logging must never break the agent
            log.exception("could not log agent run")
            return None


def log_blocked(agent: str, text: str, flags: list[str]) -> int | None:
    """Record an input the guardrails refused (no model call was made)."""
    red, f = redact(text)
    return LLMClient._log("none", agent, "none", 0, 0, 0, sorted(set(flags + f)), "blocked", red, "")


def extract_json(text: str) -> dict:
    """Pull the first JSON object out of a model reply (handles ```json fences)."""
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if not m:
        raise ValueError("no JSON object in model output")
    return json.loads(m.group(0))


def get_llm() -> LLMClient:
    return LLMClient()
