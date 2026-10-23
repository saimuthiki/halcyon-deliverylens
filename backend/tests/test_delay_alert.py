"""Delay Alert: a forward-looking, at-dispatch draft that only states facts the system knows."""
import json
import re
from datetime import date, timedelta

import pytest

CAUSES = ["incomplete_address", "same_day_after_cutoff", "stock_not_at_nearest", "weak_carrier_lane",
          "route_deviation"]
ACTION_CLAIMS = re.compile(r"we have (?:rerouted|expedited|confirmed|moved|switched)|we are (?:moving|rebalancing)",
                           re.I)


def _alert(client, delivery_id):
    r = client.post("/api/agents/delay-alert", json={"delivery_id": delivery_id})
    assert r.status_code == 200, r.text
    return r.json()


def test_predicts_delay_from_cause_combination(client, dataset):
    b = _alert(client, "D000002")  # promised 2026-04-02
    df = dataset.deliveries
    row = df[df.delivery_id == "D000002"].iloc[0]
    present = [c for c in CAUSES if row[c]]
    assert present == ["stock_not_at_nearest", "weak_carrier_lane"]
    same_combo = (df[CAUSES] == row[CAUSES]).all(axis=1)
    same = df[df.late & same_combo & (df.delivery_id != "D000002")]
    expected_days = int(-(-same.days_late.median() // 1))
    assert b["predicted_delay_days"] == expected_days
    assert b["predicted_date"] == (date(2026, 4, 2) + timedelta(days=expected_days)).isoformat()
    assert b["basis"]["cause_combination"] == present
    assert b["basis"]["late_deliveries_in_sample"] == len(same)
    assert b["basis"]["fallback"] is False
    assert b["basis"]["as_of"] == "2026-04-01 16:03"  # dispatch time (shipped_ts)


def test_message_states_cause_and_predicted_date_without_hindsight(client):
    b = _alert(client, "D000002")
    msg = b["message"]
    assert "2026-04-02" in msg and b["predicted_date"] in msg
    assert "stock" in msg.lower()
    assert "2026-04-06" not in msg or b["predicted_date"] == "2026-04-06"  # never the actual delivered date
    assert "before you have to ask" not in msg


def test_message_claims_no_actions_and_ends_with_draft_note(client):
    msg = _alert(client, "D000002")["message"]
    assert not ACTION_CLAIMS.search(msg)
    assert msg.rstrip().endswith("DRAFT: for Customer Success to review and approve before sending.")


def test_on_time_delivery_with_a_cause_is_still_alerted(client, dataset):
    df = dataset.deliveries
    row = df[~df.late & df.weak_carrier_lane].iloc[0]
    b = _alert(client, row.delivery_id)
    assert b["predicted_delay_days"] >= 1


def test_on_time_delivery_with_no_cause_is_refused(client, dataset):
    df = dataset.deliveries
    row = df[~df.late & ~df[CAUSES].any(axis=1)].iloc[0]
    r = client.post("/api/agents/delay-alert", json={"delivery_id": row.delivery_id})
    assert r.status_code == 409 and r.json()["error"]["code"] == "not_delayed"


def test_late_delivery_with_no_cause_uses_its_own_group(client, dataset):
    df = dataset.deliveries
    row = df[df.late & ~df[CAUSES].any(axis=1)].iloc[0]
    b = _alert(client, row.delivery_id)
    assert b["basis"]["cause_combination"] == [] and b["predicted_delay_days"] >= 1


def test_model_action_claims_are_replaced(dataset, monkeypatch):
    from app.agents import delay_alert
    from app.agents.llm_client import LLMResponse

    class FakeLLM:
        def generate(self, **kwargs):
            text = json.dumps({"subject": "Update", "message": "We have rerouted your order and expedited it."})
            return LLMResponse(text=text, provider="bedrock", model="m", run_id=1)

    b = delay_alert.run_delay_alert(dataset, "D000002", llm=FakeLLM())
    assert not ACTION_CLAIMS.search(b["message"])
    assert "action_claim_replaced" in b["guardrail_flags"]
    assert b["message"].rstrip().endswith("DRAFT: for Customer Success to review and approve before sending.")


@pytest.mark.parametrize("field", ["predicted_delay_days", "predicted_date", "basis", "message", "subject"])
def test_response_shape(client, field):
    assert field in _alert(client, "D000002")
