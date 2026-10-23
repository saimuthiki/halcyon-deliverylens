"""Gemini code path with a fake google-genai client (no network, no key needed)."""
import json
from types import SimpleNamespace

import pytest

FAKE_KEY = "fake-gemini-key-123"


class FakeModels:
    def __init__(self, reply: str | Exception):
        self.reply, self.calls = reply, []

    def generate_content(self, *, model, contents, config=None):
        self.calls.append({"model": model, "contents": contents, "config": config})
        if isinstance(self.reply, Exception):
            raise self.reply
        usage = SimpleNamespace(prompt_token_count=90, candidates_token_count=30)
        return SimpleNamespace(text=self.reply, usage_metadata=usage)


class FakeGemini:
    def __init__(self, reply: str | Exception):
        self.models = FakeModels(reply)


@pytest.fixture
def gemini_env(loaded_db, monkeypatch):
    from app.config import get_settings

    monkeypatch.setenv("GEMINI_API_KEY", FAKE_KEY)
    monkeypatch.setenv("GEMINI_MODEL", "gemini-test-model")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def _llm(reply):
    from app.agents.llm_client import LLMClient

    llm = LLMClient(provider="gemini")
    llm._gemini = FakeGemini(reply)
    return llm


def test_gemini_request_uses_system_instruction_json_mode_and_usage(gemini_env):
    llm = _llm('{"ok": true}')
    resp = llm.generate(agent="test", system="sys", prompt="hi", mock=lambda: "unused", json_output=True)
    call = llm._gemini.models.calls[0]
    assert call["model"] == "gemini-test-model" and call["contents"] == "hi"
    assert call["config"].system_instruction == "sys"
    assert call["config"].response_mime_type == "application/json"
    assert call["config"].temperature == 0
    assert resp.provider == "gemini" and resp.model == "gemini-test-model"
    assert resp.text == '{"ok": true}' and resp.input_tokens == 90 and resp.output_tokens == 30
    assert resp.run_id is not None


def test_gemini_plain_text_when_json_not_requested(gemini_env):
    llm = _llm("hello")
    llm.generate(agent="test", system="sys", prompt="hi", mock=lambda: "unused")
    assert llm._gemini.models.calls[0]["config"].response_mime_type is None


def test_gemini_error_becomes_llm_error_without_the_key(gemini_env):
    from app.agents.llm_client import LLMError

    llm = _llm(RuntimeError(f"401 bad key {FAKE_KEY}"))
    with pytest.raises(LLMError) as exc:
        llm.generate(agent="test", system="s", prompt="p", mock=lambda: "")
    assert FAKE_KEY not in str(exc.value)


def test_gemini_without_key_is_refused(loaded_db, monkeypatch):
    from app.agents.llm_client import LLMClient, LLMError
    from app.config import get_settings

    monkeypatch.setenv("GEMINI_API_KEY", "")
    get_settings.cache_clear()
    try:
        llm = LLMClient(provider="gemini")
        assert llm.ready() is False
        with pytest.raises(LLMError, match="GEMINI_API_KEY"):
            llm.generate(agent="test", system="s", prompt="p", mock=lambda: "")
    finally:
        get_settings.cache_clear()


def test_settings_repr_never_shows_the_key(gemini_env):
    from app.config import get_settings

    assert FAKE_KEY not in repr(get_settings())


def test_order_intake_works_with_gemini(gemini_env):
    from app.agents.order_intake import run_order_intake

    reply = json.dumps({"client_name": "Client 9", "items": [{"sku": "A1", "qty": 2}],
                        "ship_to": {"name": "Dock", "street": "1 Main St", "city": "Austin", "state": "TX",
                                    "postcode": "73301", "country": "US"},
                        "requested_date": None, "commitment_type": "standard", "received_at": None})
    llm = _llm(reply)
    out = run_order_intake("Client 9 wants 2 x SKU A1", llm=llm)
    assert out["provider"] == "gemini" and out["checks"]["address_status"] == "complete"
    assert llm._gemini.models.calls[0]["config"].response_mime_type == "application/json"


def test_delay_alert_and_ask_work_with_gemini(gemini_env, dataset):
    from app.agents.ask import run_ask
    from app.agents.delay_alert import run_delay_alert

    llm = _llm('{"subject": "Delay", "message": "Promised 2026-04-02, likely later."}')
    out = run_delay_alert(dataset, "D000002", llm=llm)
    assert out["provider"] == "gemini" and out["message"].endswith("approve before sending.")

    llm = _llm('{"tools": ["kpis"]}')
    out = run_ask(dataset, "How bad is on-time delivery?", llm=llm)
    assert out["tools_used"] == ["kpis"] and out["provider"] == "gemini"


def test_health_reports_provider_model_and_readiness(client):
    b = client.get("/api/health").json()
    assert b["llm_provider"] == "mock" and b["llm_model"] == "mock-fast" and b["llm_ready"] is True


def test_health_not_ready_when_gemini_key_missing(client, monkeypatch):
    from app.config import get_settings

    monkeypatch.setenv("LLM_PROVIDER", "gemini")
    monkeypatch.setenv("GEMINI_API_KEY", "")
    get_settings.cache_clear()
    try:
        b = client.get("/api/health").json()
        assert b["llm_provider"] == "gemini" and b["llm_ready"] is False
        assert b["llm_model"] == "gemini-2.5-flash"
    finally:
        get_settings.cache_clear()


def test_order_desk_with_gemini_routes_word_quantities_to_review(gemini_env, client):
    from app.desk.pipeline import process_message

    client.post("/api/desk/reset")
    extraction = json.dumps({"client_name": "Client 234", "items": [{"sku": "the usual", "qty": "a couple of pallets"}],
                             "ship_to": {"name": "Client 234 Milwaukee", "street": "1500 Lakefront Ave",
                                         "city": "Milwaukee", "state": "WI", "postcode": "53202", "country": None},
                             "requested_date": None, "commitment_type": "standard", "confidence": 0.9})
    llm = _llm(extraction)
    t = process_message("M11", llm=llm)
    assert t["decision"] == "needs_review" and t["llm_provider"] == "gemini"
    assert "llm_output_not_json_used_template" in t["client_email_draft"]["guardrail_flags"]  # fake echoes the extraction
    client.post("/api/desk/reset")
