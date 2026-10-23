"""Bedrock code path with a stub bedrock-runtime client (no AWS needed)."""
import json

import pytest


class StubBedrock:
    def __init__(self, reply: str):
        self.reply, self.calls = reply, []

    def converse(self, **kwargs):
        self.calls.append(kwargs)
        return {"output": {"message": {"role": "assistant", "content": [{"text": self.reply}]}},
                "usage": {"inputTokens": 120, "outputTokens": 40, "totalTokens": 160}}


@pytest.fixture
def bedrock_llm(loaded_db, monkeypatch):
    from app.agents.llm_client import LLMClient

    monkeypatch.setenv("BEDROCK_MODEL_FAST", "test-fast-model")
    monkeypatch.setenv("BEDROCK_MODEL_SMART", "test-smart-model")
    from app.config import get_settings
    get_settings.cache_clear()
    llm = LLMClient(provider="bedrock")
    yield llm
    get_settings.cache_clear()


def test_bedrock_converse_request_and_usage(bedrock_llm):
    stub = StubBedrock('{"ok": true}')
    bedrock_llm._bedrock = stub
    resp = bedrock_llm.generate(agent="test", system="sys", prompt="hi", mock=lambda: "unused", tier="smart")
    call = stub.calls[0]
    assert call["modelId"] == "test-smart-model"
    assert call["system"] == [{"text": "sys"}]
    assert call["messages"] == [{"role": "user", "content": [{"text": "hi"}]}]
    assert resp.text == '{"ok": true}' and resp.input_tokens == 120 and resp.output_tokens == 40
    assert resp.run_id is not None


def test_order_intake_falls_back_to_parser_on_bad_llm_json(bedrock_llm):
    from app.agents.order_intake import run_order_intake
    from conftest import SAMPLE_EMAILS

    bedrock_llm._bedrock = StubBedrock("Sorry, I cannot produce JSON")
    out = run_order_intake((SAMPLE_EMAILS / "01_complete_next_day.txt").read_text(), llm=bedrock_llm)
    assert "llm_output_invalid_used_parser" in out["guardrail_flags"]
    assert out["extraction"]["ship_to"]["city"] == "Columbus"


def test_order_intake_uses_llm_json(bedrock_llm):
    from app.agents.order_intake import run_order_intake

    reply = json.dumps({"client_name": "Client 9", "items": [{"sku": "A1", "qty": 2}],
                        "ship_to": {"name": "Dock", "street": None, "city": "Austin", "state": "TX",
                                    "postcode": None, "country": "US"},
                        "requested_date": None, "commitment_type": "standard", "received_at": None})
    bedrock_llm._bedrock = StubBedrock(f"```json\n{reply}\n```")
    out = run_order_intake("Client 9 wants 2 x SKU A1 to Austin TX", llm=bedrock_llm)
    assert out["extraction"]["client_name"] == "Client 9"
    assert out["checks"]["missing_address_fields"] == ["street", "postcode"]


def test_ask_appends_numbers_when_model_omits_them(bedrock_llm, dataset):
    from app.agents.ask import run_ask

    bedrock_llm._bedrock = StubBedrock("It is complicated.")
    out = run_ask(dataset, "How many clients are at risk?", llm=bedrock_llm)
    assert "route_fallback_keywords" in out["guardrail_flags"]
    assert "numbers_appended" in out["guardrail_flags"] and "Numbers used" in out["answer"]


def test_placeholder_model_id_is_refused(loaded_db):
    from app.agents.llm_client import LLMClient, LLMError

    llm = LLMClient(provider="bedrock")
    with pytest.raises(LLMError):
        llm.generate(agent="test", system="s", prompt="p", mock=lambda: "")
