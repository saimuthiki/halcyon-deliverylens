"""One small interface over three LLM providers.

LLM_PROVIDER=mock    (default) deterministic, offline; each agent supplies a `mock` function that
                     produces realistic output from the same inputs (used by tests and demos).
LLM_PROVIDER=bedrock Amazon Bedrock Converse API via boto3. Region from AWS_REGION; model IDs from
                     BEDROCK_MODEL_FAST / BEDROCK_MODEL_SMART.
LLM_PROVIDER=gemini  Google Gemini via the official google-genai SDK. Key from GEMINI_API_KEY (never
                     logged); model from GEMINI_MODEL (default gemini-2.5-flash) for every tier.

Agents that need JSON pass json_output=True: Gemini then runs in JSON mode
(response_mime_type=application/json); Bedrock and mock rely on the prompt plus extract_json().

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


PROVIDERS = {"mock", "bedrock", "gemini"}


def _scrub_secrets(message: str) -> str:
    """Never let an API key reach logs, agent_runs or an HTTP error body."""
    key = get_settings().gemini_api_key
    return message.replace(key, "[REDACTED]") if key else message


def _estimate_tokens(text: str) -> int:
    return max(1, len(text) // 4)


class LLMClient:
    def __init__(self, provider: str | None = None):
        s = get_settings()
        self.provider = (provider or s.llm_provider).lower()
        if self.provider not in PROVIDERS:
            raise ValueError(f"Unknown LLM_PROVIDER {self.provider!r}; use one of {sorted(PROVIDERS)}")
        self._bedrock = None
        self._gemini = None

    def model_for(self, tier: str) -> str:
        s = get_settings()
        if self.provider == "mock":
            return f"mock-{tier}"
        if self.provider == "gemini":
            return s.gemini_model
        return s.bedrock_model_smart if tier == "smart" else s.bedrock_model_fast

    def ready(self) -> bool:
        """False when the provider is missing configuration it needs (key or model ID)."""
        s = get_settings()
        if self.provider == "gemini":
            return bool(s.gemini_api_key)
        if self.provider == "bedrock":
            return PLACEHOLDER_MODEL_ID not in (s.bedrock_model_fast, s.bedrock_model_smart)
        return True

    # ------------------------------------------------------------------
    def generate(self, *, agent: str, system: str, prompt: str, mock: Callable[[], str],
                 tier: str = "fast", max_tokens: int = 1024, flags: list[str] | None = None,
                 json_output: bool = False) -> LLMResponse:
        """Run one completion and log it. `mock` builds the deterministic response for provider=mock.
        json_output=True asks providers that support it (Gemini) for a JSON-only reply."""
        model = self.model_for(tier)
        start = time.perf_counter()
        status = "ok"
        try:
            if self.provider == "mock":
                text = mock()
                in_tok, out_tok = _estimate_tokens(system + prompt), _estimate_tokens(text)
            elif self.provider == "gemini":
                text, in_tok, out_tok = self._gemini_generate(model, system, prompt, max_tokens, json_output)
            else:
                text, in_tok, out_tok = self._converse(model, system, prompt, max_tokens)
        except Exception as exc:  # log the failure, then surface it
            status = "error"
            message = _scrub_secrets(str(exc))
            text, in_tok, out_tok = f"ERROR: {message}", 0, 0
            raise LLMError(message) from None
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

    def _gemini_generate(self, model: str, system: str, prompt: str, max_tokens: int,
                         json_output: bool) -> tuple[str, int, int]:
        s = get_settings()
        if not s.gemini_api_key:
            raise LLMError("Set GEMINI_API_KEY in backend/.env (or switch LLM_PROVIDER back to mock)")
        from google.genai import types

        if self._gemini is None:
            from google import genai

            self._gemini = genai.Client(api_key=s.gemini_api_key,
                                        http_options=types.HttpOptions(timeout=s.llm_timeout_seconds * 1000))
        # Gemini 2.5 models "think" before answering and those tokens count against max_output_tokens,
        # so leave generous headroom above what the answer itself needs.
        config = types.GenerateContentConfig(
            system_instruction=system, temperature=0, max_output_tokens=max(max_tokens, 1024) + 4096,
            response_mime_type="application/json" if json_output else None)
        resp = self._gemini.models.generate_content(model=model, contents=prompt, config=config)
        text = resp.text or ""
        if not text:
            raise LLMError("Gemini returned an empty reply (possibly blocked by its safety filters)")
        usage = getattr(resp, "usage_metadata", None)
        return (text, int(getattr(usage, "prompt_token_count", 0) or 0),
                int(getattr(usage, "candidates_token_count", 0) or 0))

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
