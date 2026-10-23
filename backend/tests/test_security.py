"""Agent endpoint protection: rate limit, optional demo token, PII redaction before archiving."""
import json

import pytest


@pytest.fixture
def settings_env(monkeypatch):
    """Set env vars for one test and rebuild the cached settings around it."""
    from app.api.security import limiter
    from app.config import get_settings

    def apply(**env):
        for k, v in env.items():
            monkeypatch.setenv(k, v)
        get_settings.cache_clear()
        limiter.reset()

    yield apply
    monkeypatch.undo()
    get_settings.cache_clear()
    limiter.reset()


def test_rate_limiter_counts_per_key_within_window():
    from app.api.security import RateLimiter

    now = [1000.0]
    rl = RateLimiter(clock=lambda: now[0])
    assert [rl.allow("1.1.1.1", 2)[0] for _ in range(3)] == [True, True, False]
    assert rl.allow("2.2.2.2", 2)[0] is True  # other clients are not affected
    allowed, retry_after = rl.allow("1.1.1.1", 2)
    assert not allowed and 1 <= retry_after <= 60
    now[0] += 61
    assert rl.allow("1.1.1.1", 2)[0] is True  # window has passed


def test_agent_endpoints_return_429_with_error_shape(client, settings_env):
    settings_env(AGENT_RATE_LIMIT_PER_MIN="2")
    codes = [client.post("/api/agents/ask", json={"question": "How bad is on-time?"}).status_code for _ in range(3)]
    assert codes == [200, 200, 429]
    r = client.get("/api/agents/runs")
    assert r.status_code == 429
    assert r.json()["error"]["code"] == "rate_limited" and r.headers["Retry-After"]
    assert client.get("/api/kpis").status_code == 200  # analytics are not limited


def test_demo_token_required_on_agent_posts_when_set(client, settings_env):
    settings_env(DEMO_TOKEN="s3cret-demo")
    body = {"question": "How bad is on-time?"}
    r = client.post("/api/agents/ask", json=body)
    assert r.status_code == 401 and r.json()["error"]["code"] == "unauthorized"
    assert client.post("/api/agents/ask", json=body, headers={"X-Demo-Token": "wrong"}).status_code == 401
    assert client.post("/api/agents/ask", json=body, headers={"X-Demo-Token": "s3cret-demo"}).status_code == 200
    assert client.get("/api/agents/runs").status_code == 200  # reads stay open
    assert client.post("/api/simulate", json={"fixes": {}}).status_code == 200


def test_no_demo_token_means_open(client, settings_env):
    settings_env(DEMO_TOKEN="")
    assert client.post("/api/agents/ask", json={"question": "How bad is on-time?"}).status_code == 200


def test_archive_payload_is_redacted(client, settings_env, monkeypatch):
    import boto3

    puts = []

    class FakeS3:
        def put_object(self, **kwargs):
            puts.append(kwargs)

    settings_env(S3_BUCKET="deliverylens-test")
    monkeypatch.setattr(boto3, "client", lambda *a, **k: FakeS3())
    email = "From: buyer@client-9.example\nCall 312-555-0100\nSKU HX-1 x 2\nDeliver to: 500 Main St, Dallas TX 75201"
    r = client.post("/api/agents/order-intake", json={"email_text": email})
    assert r.status_code == 200 and r.json()["archived_to"].startswith("s3://deliverylens-test/")
    body = puts[0]["Body"].decode()
    assert "buyer@client-9.example" not in body and "312-555-0100" not in body
    assert "[EMAIL]" in body and "[PHONE]" in body
    assert json.loads(body)["result"]["checks"]["address_status"] == "incomplete"
