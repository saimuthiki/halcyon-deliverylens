"""Secrets the API reads itself from AWS Secrets Manager at runtime, with boto3 and the EC2 instance role.

APP_SECRET_ID names the secret (production: deliverylens/app; the deploy writes it into app.env, with
APP_SECRET_ACCOUNT). The secret that comes back must match that name, AWS_REGION and APP_SECRET_ACCOUNT. Only the keys in
RUNTIME_KEYS are used. They are kept in this process's memory: never written to a file, never put into
os.environ, never logged. The deploy leaves these keys out of app.env, so the SMTP credentials are not on the
server's disk.

An environment variable with the same name wins (local development, tests). Without APP_SECRET_ID nothing is
fetched. If the secret cannot be read, the API starts without these values: SNS keeps working, and
EMAIL_BACKEND=smtp fails closed ("EMAIL_BACKEND=smtp needs SMTP_...").
"""
import json
import logging
import os
import threading

log = logging.getLogger(__name__)

RUNTIME_KEYS = ("SMTP_HOST", "SMTP_PORT", "SMTP_SECURITY", "SMTP_USERNAME", "SMTP_PASSWORD")


class SecretError(ValueError):
    pass


def parse_secret(secret_string: str) -> dict[str, str]:
    """The runtime keys from a JSON secret, as strings. Other keys are ignored; empty values are dropped.
    A bad SMTP_PORT is dropped (with a warning) instead of stopping the API from starting."""
    try:
        data = json.loads(secret_string)
    except (TypeError, json.JSONDecodeError):
        raise SecretError("the secret is not valid JSON") from None
    if not isinstance(data, dict):
        raise SecretError("the secret is not a JSON object")
    out = {}
    for key in RUNTIME_KEYS:
        value = data.get(key)
        if value is None or isinstance(value, (dict, list, bool)):
            continue
        value = str(value).strip()
        if not value:
            continue
        if key == "SMTP_PORT" and not (value.isdigit() and 0 < int(value) < 65536):
            log.warning(json.dumps({"event": "runtime_secret_ignored", "key": key, "reason": "not a port number"}))
            continue
        out[key] = value
    return out


def _client(region: str):
    import boto3
    from botocore.config import Config

    return boto3.client("secretsmanager", region_name=region,
                        config=Config(connect_timeout=3, read_timeout=5, retries={"max_attempts": 2, "mode": "standard"}))


def check_identity(resp: dict, secret_id: str, region: str, account: str = "") -> None:
    """The secret that came back is the one asked for: a Secrets Manager ARN in the expected region (and account,
    when APP_SECRET_ACCOUNT is set), with the expected name. Raises SecretError; the messages hold no values."""
    parts = str(resp.get("ARN", "")).split(":")  # arn:aws:secretsmanager:<region>:<account>:secret:<name>-<suffix>
    if len(parts) < 7 or parts[2] != "secretsmanager" or parts[5] != "secret":
        raise SecretError("the response has no Secrets Manager ARN")
    if parts[3] != region:
        raise SecretError(f"the secret is in region {parts[3]}, expected {region}")
    if account and parts[4] != account:
        raise SecretError(f"the secret is in account {parts[4]}, expected {account}")
    matches = resp.get("ARN") == secret_id if secret_id.startswith("arn:") else resp.get("Name") == secret_id
    if not matches:
        raise SecretError("the secret's name does not match APP_SECRET_ID")


def fetch(secret_id: str, region: str, client=None, account: str = "") -> dict[str, str]:
    resp = (client or _client(region)).get_secret_value(SecretId=secret_id)
    check_identity(resp, secret_id, region, account)
    if "SecretString" not in resp:
        raise SecretError("the secret is binary, not JSON text")
    return parse_secret(resp["SecretString"])


_lock = threading.Lock()
_cache: dict[str, str] | None = None


def runtime_values() -> dict[str, str]:
    """The runtime keys from APP_SECRET_ID, fetched once per process. {} when unset or unreadable."""
    global _cache
    secret_id = os.getenv("APP_SECRET_ID", "").strip()
    if not secret_id:
        return {}
    with _lock:
        if _cache is None:
            region = os.getenv("AWS_REGION", "").strip() or "us-east-1"
            account = os.getenv("APP_SECRET_ACCOUNT", "").strip()
            try:
                _cache = fetch(secret_id, region, account=account)
                log.info(json.dumps({"event": "runtime_secret_loaded", "secret": secret_id, "keys": sorted(_cache)}))
            except Exception as exc:  # never fatal: the API must still start (SNS does not need these values)
                code = (getattr(exc, "response", None) or {}).get("Error", {}).get("Code")  # botocore ClientError
                record = {"event": "runtime_secret_unavailable", "secret": secret_id, "error": code or type(exc).__name__}
                if isinstance(exc, SecretError):
                    record["reason"] = str(exc)  # our own messages: never a value
                log.warning(json.dumps(record))
                _cache = {}
        return _cache


def value(name: str, default: str = "") -> str:
    """An environment variable if set and non-empty, else the runtime secret's value, else the default."""
    env = os.getenv(name)
    if env is not None and env.strip():
        return env
    if name in RUNTIME_KEYS:
        return runtime_values().get(name, default)
    return default


def reset() -> None:
    """Forget the fetched values (tests)."""
    global _cache
    with _lock:
        _cache = None
