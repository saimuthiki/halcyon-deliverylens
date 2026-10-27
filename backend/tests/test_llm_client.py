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


def test_ask_year_alone_does_not_count_as_citing_a_number(bedrock_llm, dataset):
    from app.agents.ask import run_ask, tool_at_risk_clients

    _, nums = tool_at_risk_clients(dataset)
    # Every number appears only inside a longer token (old substring check passed on that).
    hidden = " ".join(f"ref{str(v).split()[0].rstrip('%')}" for v in nums.values())
    bedrock_llm._bedrock = StubBedrock(f"Things changed a lot in 2026. Ticket {hidden}.")
    out = run_ask(dataset, "How many clients are at risk?", llm=bedrock_llm)
    assert "numbers_appended" in out["guardrail_flags"] and "Numbers used" in out["answer"]


def test_ask_numbers_match_as_whole_tokens():
    from app.agents.ask import cites_a_number

    nums = {"at_risk_clients": 12, "revenue_usd": 1234567, "rate": "73.2%", "best_South": "CR03 81.0%"}
    assert cites_a_number("Revenue at risk is $1,234,567 a year.", nums)
    assert cites_a_number("On time 73.2% of the time.", nums)
    assert cites_a_number("We have 12, all at risk.", nums)
    assert cites_a_number("Carrier CR03 is on time 81.0%.", nums)
    assert not cites_a_number("Order 112 and 2026 only.", nums)  # 12 inside 112 is not a citation
    assert not cites_a_number("We had 3 issues.", {"a": 3, "b": "2.5%"})  # every value < 10: append


# ---------------------------------------------------------------- Ask: complaint retrieval (mock provider)
@pytest.fixture
def mock_llm(loaded_db):
    from app.agents.llm_client import LLMClient

    return LLMClient(provider="mock")


def test_ask_why_complaining_routes_to_complaints_and_cites_not_told(mock_llm, dataset):
    from app.agents.ask import run_ask

    out = run_ask(dataset, "Why are clients complaining?", llm=mock_llm)
    assert out["tools_used"][0] == "complaints"
    assert "12 of 34" in out["answer"] and "Not told about the delay" in out["answer"]
    assert "escalated" in out["answer"]
    assert "numbers_appended" not in out["guardrail_flags"]
    assert out["numbers_used"]["complaints_total"] == "34"
    assert out["numbers_used"]["not_told_about_delay"] == "12"


def test_ask_client_complaints_returns_only_that_client_with_causes(mock_llm, dataset):
    from app.agents.ask import run_ask
    from app.analytics.causes import causes_of

    out = run_ask(dataset, "What did C055 complain about?", llm=mock_llm)
    facts = out["facts"]["complaints"]
    mine = dataset.complaints[dataset.complaints.client_id == "C055"]
    others = dataset.complaints[dataset.complaints.client_id != "C055"]
    assert len(mine) == 4
    for c in mine.itertuples():
        assert c.complaint_id in facts and c.delivery_id in facts
        for cause in causes_of(dataset.by_id.loc[c.delivery_id]):
            assert cause.replace("_", " ") in facts
    assert not any(cid in facts for cid in others.complaint_id)
    assert "threatening to leave" in facts and "Tier 2" in facts
    assert out["numbers_used"]["complaints_matched"] == "4"


def test_ask_client_name_form_is_understood(mock_llm, dataset):
    from app.agents.ask import tool_complaints

    text, nums = tool_complaints(dataset, question="What has Client 190 complained about?")
    assert nums["complaints_matched"] == str(int((dataset.complaints.client_id == "C190").sum())) == "11"
    assert "CMP003" not in text


def test_ask_refund_policy_says_no_policy_records(mock_llm, dataset):
    from app.agents.ask import run_ask

    out = run_ask(dataset, "What is our refund policy for complaints about late deliveries?", llm=mock_llm)
    assert "complaints" in out["tools_used"]
    assert "no policy or resolution records" in out["answer"]


def test_policy_question_leads_with_the_no_policy_note(dataset):
    from app.agents.ask import tool_complaints

    text, _ = tool_complaints(dataset, question="How do we usually resolve a penalty dispute?")
    assert text.startswith("The dataset holds no policy or resolution records")
    assert "CMP023" in text and "CMP028" in text  # the two penalty disputes are still retrieved


def test_unfiltered_question_shows_one_example_per_category(dataset):
    from app.agents.ask import tool_complaints

    text, _ = tool_complaints(dataset, question="Why are clients complaining?")
    assert "one example per category" in text
    assert "CMP023" in text  # first penalty dispute, which a date-ordered top-8 would miss
    assert text.count("Delivery late 14") == 1


def test_other_tools_still_take_only_the_dataset(mock_llm, dataset):
    from app.agents.ask import run_ask

    out = run_ask(dataset, "Should we sign the routing vendor contract?", llm=mock_llm)
    assert "vendor_assessment" in out["tools_used"] and "80.2%" in out["answer"]


def test_placeholder_model_id_is_refused(loaded_db):
    from app.agents.llm_client import LLMClient, LLMError

    llm = LLMClient(provider="bedrock")
    with pytest.raises(LLMError):
        llm.generate(agent="test", system="s", prompt="p", mock=lambda: "")
