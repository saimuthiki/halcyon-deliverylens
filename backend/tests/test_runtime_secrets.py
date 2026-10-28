"""Runtime secrets (boto3, APP_SECRET_ID), the SMTP provisioning script and the deploy scripts that write app.env.
No test talks to AWS: every client and session is a fake. Values below are placeholders, not credentials."""
import importlib.util
import json
import logging
import re
import shutil
import subprocess
from dataclasses import replace
from pathlib import Path

import pytest
from botocore.exceptions import ClientError, EndpointConnectionError

from app import runtime_secrets as rs
from app.config import get_settings

REPO = Path(__file__).resolve().parents[2]
SMTP = {"SMTP_HOST": "smtp.example.test", "SMTP_PORT": "587", "SMTP_SECURITY": "starttls",
        "SMTP_USERNAME": "user-placeholder", "SMTP_PASSWORD": "password-placeholder"}
APP_SECRET = {"DATABASE_URL": "postgresql+psycopg://db-placeholder", "LLM_PROVIDER": "bedrock",
              "WEEKLY_BRIEF_TOPIC_ARN": "arn:topic-placeholder", "CORS_ORIGINS": "https://site.example"}


@pytest.fixture(autouse=True)
def _clean(monkeypatch):
    rs.reset()
    monkeypatch.delenv("APP_SECRET_ID", raising=False)
    for k in rs.RUNTIME_KEYS:
        monkeypatch.delenv(k, raising=False)
    get_settings.cache_clear()
    yield
    rs.reset()
    get_settings.cache_clear()


ARN = "arn:aws:secretsmanager:us-east-1:781547812451:secret:deliverylens/app-AbC123"


class FakeSecrets:
    def __init__(self, secret=None, error=None, arn=ARN, name="deliverylens/app"):
        self.secret, self.error, self.calls, self.arn, self.name = secret, error, 0, arn, name

    def get_secret_value(self, SecretId):
        self.calls += 1
        if self.error:
            raise self.error
        return {"ARN": self.arn, "Name": self.name, "SecretString": json.dumps(self.secret), "VersionId": "v1"}


def use_secret(monkeypatch, client, secret_id="deliverylens/app"):
    monkeypatch.setenv("APP_SECRET_ID", secret_id)
    monkeypatch.setattr(rs, "_client", lambda region: client)


# ---------------------------------------------------------------- parsing
def test_parse_keeps_only_the_smtp_keys_as_strings():
    out = rs.parse_secret(json.dumps({**APP_SECRET, **SMTP, "SMTP_PORT": 587, "SMTP_TIMEOUT_SECONDS": "9"}))
    assert out == SMTP  # port number became "587"; DATABASE_URL and other keys are not exposed here


@pytest.mark.parametrize("raw, kept", [
    ({"SMTP_HOST": "", "SMTP_USERNAME": None, "SMTP_PASSWORD": "  "}, {}),
    ({"SMTP_PORT": "smtp"}, {}),
    ({"SMTP_PORT": "70000"}, {}),
    ({"SMTP_HOST": {"nested": 1}, "SMTP_SECURITY": True}, {}),
    ({"SMTP_HOST": " smtp.example.test "}, {"SMTP_HOST": "smtp.example.test"}),
])
def test_parse_drops_missing_or_unusable_fields(raw, kept):
    assert rs.parse_secret(json.dumps(raw)) == kept


@pytest.mark.parametrize("raw", ["not json", "[1, 2]", '"text"'])
def test_parse_rejects_a_secret_that_is_not_a_json_object(raw):
    with pytest.raises(rs.SecretError):
        rs.parse_secret(raw)


def test_fetch_refuses_a_binary_secret():
    class Binary:
        def get_secret_value(self, SecretId):
            return {"ARN": ARN, "Name": "deliverylens/app", "SecretBinary": b"x"}
    with pytest.raises(rs.SecretError, match="binary"):
        rs.fetch("deliverylens/app", "us-east-1", client=Binary())


@pytest.mark.parametrize("client, secret_id, account, error", [
    (FakeSecrets(SMTP, arn=ARN.replace("us-east-1", "eu-west-1")), "deliverylens/app", "", "region eu-west-1"),
    (FakeSecrets(SMTP), "deliverylens/app", "559928725722", "account 781547812451, expected 559928725722"),
    (FakeSecrets(SMTP, name="other/app"), "deliverylens/app", "", "name does not match"),
    (FakeSecrets(SMTP, arn="not-an-arn"), "deliverylens/app", "", "no Secrets Manager ARN"),
    (FakeSecrets(SMTP), ARN.replace("AbC123", "XyZ999"), "", "name does not match"),
])
def test_fetch_refuses_a_secret_that_is_not_the_one_expected(client, secret_id, account, error):
    with pytest.raises(rs.SecretError, match=error):
        rs.fetch(secret_id, "us-east-1", client=client, account=account)


def test_fetch_accepts_the_expected_secret_by_name_or_arn():
    assert rs.fetch("deliverylens/app", "us-east-1", client=FakeSecrets(SMTP), account="781547812451") == SMTP
    assert rs.fetch(ARN, "us-east-1", client=FakeSecrets(SMTP), account="781547812451") == SMTP


def test_an_unexpected_account_at_runtime_is_logged_and_ignored(monkeypatch, caplog):
    use_secret(monkeypatch, FakeSecrets({**APP_SECRET, **SMTP}))
    monkeypatch.setenv("APP_SECRET_ACCOUNT", "559928725722")
    with caplog.at_level(logging.WARNING, logger="app.runtime_secrets"):
        assert rs.runtime_values() == {}
    record = json.loads(caplog.records[-1].getMessage())
    assert record["error"] == "SecretError" and "expected 559928725722" in record["reason"]
    assert "password-placeholder" not in caplog.text


# ---------------------------------------------------------------- retrieval at runtime
def test_without_app_secret_id_nothing_is_fetched(monkeypatch):
    monkeypatch.setattr(rs, "_client", lambda region: pytest.fail("must not create a Secrets Manager client"))
    assert rs.runtime_values() == {} and rs.value("SMTP_HOST") == ""


def test_fetched_once_per_process_and_logged_without_values(monkeypatch, caplog):
    client = FakeSecrets({**APP_SECRET, **SMTP})
    use_secret(monkeypatch, client)
    with caplog.at_level(logging.INFO, logger="app.runtime_secrets"):
        assert rs.value("SMTP_PASSWORD") == "password-placeholder"
        assert rs.value("SMTP_HOST") == "smtp.example.test"
    assert client.calls == 1
    assert json.loads(caplog.records[-1].getMessage()) == {
        "event": "runtime_secret_loaded", "secret": "deliverylens/app", "keys": sorted(SMTP)}
    assert "password-placeholder" not in caplog.text and "user-placeholder" not in caplog.text


@pytest.mark.parametrize("error, code", [
    (ClientError({"Error": {"Code": "AccessDeniedException", "Message": "no access to arn:secret"}}, "GetSecretValue"),
     "AccessDeniedException"),
    (ClientError({"Error": {"Code": "ResourceNotFoundException", "Message": "not found"}}, "GetSecretValue"),
     "ResourceNotFoundException"),
    (EndpointConnectionError(endpoint_url="https://secretsmanager.example"), "EndpointConnectionError"),
    (rs.SecretError("the secret is not valid JSON"), "SecretError"),
])
def test_a_retrieval_failure_is_logged_and_the_api_still_starts(monkeypatch, caplog, error, code):
    use_secret(monkeypatch, FakeSecrets(error=error))
    with caplog.at_level(logging.WARNING, logger="app.runtime_secrets"):
        assert rs.runtime_values() == {}
    record = json.loads(caplog.records[-1].getMessage())
    assert {k: record[k] for k in ("event", "secret", "error")} == {
        "event": "runtime_secret_unavailable", "secret": "deliverylens/app", "error": code}
    assert set(record) - {"event", "secret", "error"} <= {"reason"}  # our own messages only, never a value


def test_environment_wins_and_other_keys_never_come_from_the_secret(monkeypatch):
    use_secret(monkeypatch, FakeSecrets({**APP_SECRET, **SMTP, "BREVO_API_KEY": "api-placeholder"}))
    monkeypatch.delenv("BREVO_API_KEY", raising=False)
    monkeypatch.setenv("SMTP_HOST", "smtp.override.test")
    monkeypatch.setenv("SMTP_PORT", "  ")  # blank counts as unset
    assert rs.value("SMTP_HOST") == "smtp.override.test" and rs.value("SMTP_PORT") == "587"
    assert rs.value("BREVO_API_KEY", "unset") == "unset"  # only the SMTP keys are read from the secret


# ---------------------------------------------------------------- settings
def test_settings_take_smtp_from_the_runtime_secret(monkeypatch):
    use_secret(monkeypatch, FakeSecrets({**APP_SECRET, **SMTP}))
    s = get_settings()
    assert (s.smtp_host, s.smtp_port, s.smtp_security, s.smtp_username, s.smtp_password) == (
        "smtp.example.test", 587, "starttls", "user-placeholder", "password-placeholder")
    assert "password-placeholder" not in repr(s) and "user-placeholder" not in repr(s)
    assert s.email_backend == "sns"  # the secret never switches the backend


def test_sns_keeps_working_when_the_smtp_settings_are_absent(monkeypatch, dataset):
    from app.agents.weekly_brief import run_weekly_brief
    from app.email import EmailConfigError, get_backend

    use_secret(monkeypatch, FakeSecrets(error=EndpointConnectionError(endpoint_url="https://x")))
    s = get_settings()
    assert s.email_backend == "sns" and s.smtp_host == "" and s.smtp_password == ""
    r = run_weekly_brief(dataset)  # the preview and SNS delivery status do not need SMTP
    assert r["delivery"]["backend"] == "sns" and r["brief"]["body"]
    with pytest.raises(EmailConfigError, match="needs SMTP_HOST, SMTP_USERNAME, SMTP_PASSWORD"):
        get_backend(replace(s, email_backend="smtp"))  # selecting SMTP without its settings fails closed


# ---------------------------------------------------------------- the provisioning script
def _load_script():
    spec = importlib.util.spec_from_file_location("smtp_secret", REPO / "infra" / "scripts" / "10-smtp-secret.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


script = _load_script()


class NotFound(Exception):
    pass


class FakeSM:
    class exceptions:
        ResourceNotFoundException = NotFound

    def __init__(self, secret, *, change_before_write=False, drop_on_write=None):
        self.secret, self.version, self.reads, self.puts = secret, "v1", 0, []
        self.change_before_write, self.drop_on_write = change_before_write, drop_on_write

    def get_secret_value(self, SecretId):
        self.reads += 1
        if self.secret is None:
            raise NotFound()
        if self.change_before_write and self.reads == 2:
            self.version = "v2"  # someone else updated it in between
        return {"SecretString": json.dumps(self.secret), "VersionId": self.version}

    def put_secret_value(self, SecretId, SecretString, ClientRequestToken):
        data = json.loads(SecretString)
        self.puts.append(data)
        if self.drop_on_write:
            data.pop(self.drop_on_write)
        self.secret, self.version = data, "v3"


class FakeSession:
    region_name = "us-east-1"

    def __init__(self, sm, account="781547812451"):
        self.sm, self.account = sm, account

    def client(self, name):
        if name == "sts":
            return type("STS", (), {"get_caller_identity": lambda _self: {"Account": self.account}})()
        return self.sm


@pytest.fixture()
def env_file(tmp_path):
    p = tmp_path / ".env"
    p.write_text("# local only\nexport SMTP_HOST=smtp.example.test\nSMTP_PORT=587\nSMTP_SECURITY='starttls'\n"
                 "SMTP_USERNAME = user-placeholder\nSMTP_PASSWORD=\"password-placeholder\"\nOTHER=ignored\n")
    return p


def run_script(sm, env_file, apply, **kw):
    lines = []
    code = script.run(FakeSession(sm, **kw), secret_id="deliverylens/app", expect_account="781547812451",
                      env_file=env_file, apply=apply, out=lines.append)
    text = "\n".join(lines)
    for secret in ("password-placeholder", "user-placeholder", "smtp.example.test", "db-placeholder"):
        assert secret not in text  # only key names and counts are ever printed
    return code, text


def test_env_file_parsing(env_file):
    assert script.read_env_file(env_file) == SMTP


def test_validation_names_problems_without_values():
    errors = script.validate({**SMTP, "SMTP_PORT": "465", "SMTP_PASSWORD": ""})
    assert errors == ["SMTP_PASSWORD is missing or empty",
                      "SMTP_SECURITY does not match SMTP_PORT (starttls uses 587, ssl uses 465)"]
    assert script.validate({**SMTP, "SMTP_SECURITY": "plain"}) == ["SMTP_SECURITY must be starttls or ssl"]


def test_dry_run_writes_nothing(env_file):
    sm = FakeSM(dict(APP_SECRET))
    code, text = run_script(sm, env_file, apply=False)
    assert code == 0 and sm.puts == [] and "dry run" in text and "SMTP_PASSWORD" in text and "kept as they are: 4" in text


def test_apply_merges_and_preserves_every_existing_field(env_file):
    sm = FakeSM({**APP_SECRET, "SMTP_PASSWORD": "old-rotated-placeholder", "BREVO_API_KEY": "api-placeholder"})
    code, text = run_script(sm, env_file, apply=True)
    assert code == 0 and len(sm.puts) == 1
    assert sm.puts[0] == {**APP_SECRET, "BREVO_API_KEY": "api-placeholder", **SMTP}
    assert "changed: ['SMTP_PASSWORD']" in text and "written and verified" in text


def test_nothing_to_change_writes_nothing(env_file):
    sm = FakeSM({**APP_SECRET, **SMTP})
    assert run_script(sm, env_file, apply=True)[0] == 0 and sm.puts == []


@pytest.mark.parametrize("sm, kw, message", [
    (FakeSM(None), {}, "does not exist; not creating it"),
    (FakeSM({"SOMETHING": "else"}), {}, "does not look like the app secret"),
    (FakeSM(dict(APP_SECRET)), {"account": "559928725722"}, "expected 781547812451"),
    (FakeSM(dict(APP_SECRET), change_before_write=True), {}, "changed while this ran"),
    (FakeSM(dict(APP_SECRET), drop_on_write="CORS_ORIGINS"), {}, "CORS_ORIGINS was lost or changed"),
    (FakeSM(dict(APP_SECRET), drop_on_write="DATABASE_URL"), {}, "does not look like the app secret"),
])
def test_unsafe_situations_stop(env_file, sm, kw, message):
    with pytest.raises(script.Abort, match=message):
        run_script(sm, env_file, apply=True, **kw)
    if not sm.drop_on_write:  # every other case stops before writing
        assert sm.puts == []


def test_wrong_account_stops_before_reading_the_secret(env_file):
    sm = FakeSM(dict(APP_SECRET))
    with pytest.raises(script.Abort):
        run_script(sm, env_file, apply=False, account="559928725722")
    assert sm.reads == 0


def test_incomplete_env_file_stops_before_aws(tmp_path):
    p = tmp_path / ".env"
    p.write_text("SMTP_HOST=smtp.example.test\n")
    sm = FakeSM(dict(APP_SECRET))
    with pytest.raises(script.Abort, match="SMTP_PASSWORD is missing"):
        run_script(sm, p, apply=True)
    assert sm.reads == 0


# ---------------------------------------------------------------- deploy scripts and image
WRITERS = [REPO / ".github" / "workflows" / "deploy.yml", REPO / "infra" / "scripts" / "07-deploy.sh",
           REPO / "infra" / "scripts" / "09-weekly-brief.sh"]
JQ_FILTER = 'to_entries[] | select(.key | startswith("SMTP_") | not) | "\\(.key)=\\(.value)"'


@pytest.mark.parametrize("path", WRITERS, ids=lambda p: p.name)
def test_every_app_env_writer_keeps_smtp_out_and_points_at_the_secret(path):
    text = path.read_text()
    assert JQ_FILTER in text and "printf 'APP_SECRET_ID=%s\\nAPP_SECRET_ACCOUNT=%s\\n' \"$SECRET_NAME\"" in text
    assert "umask 077" in text and "rm -f /home/ec2-user/app.env.tmp" in text and "mv app.env.tmp app.env" in text
    assert "jq -r 'to_entries[] | \"\\(.key)=\\(.value)\"' > app.env" not in text  # the old unfiltered dump


@pytest.mark.skipif(shutil.which("jq") is None, reason="jq is not installed here (it is on the CI runner)")
def test_the_jq_filter_drops_only_smtp_keys():
    out = subprocess.run(["jq", "-r", JQ_FILTER], input=json.dumps({**APP_SECRET, **SMTP}), capture_output=True,
                         text=True, check=True).stdout
    assert out.splitlines() == [f"{k}={v}" for k, v in APP_SECRET.items()]


def test_05_merges_into_the_secret_instead_of_replacing_it(tmp_path):
    text = (REPO / "infra" / "scripts" / "05-secrets-rds.sh").read_text()
    snippet = re.search(r"\"\$PY\" -c '([^']+)' \"\$NEW\"", text).group(1)
    new = tmp_path / "new.json"
    new.write_text(json.dumps({"DATABASE_URL": "postgresql+psycopg://new-placeholder", "WEEKLY_BRIEF_TOPIC_ARN": ""}))
    out = subprocess.run(["python", "-c", snippet, str(new)], input=json.dumps({**APP_SECRET, **SMTP}),
                         capture_output=True, text=True, check=True).stdout
    merged = json.loads(out)
    assert merged == {**APP_SECRET, **SMTP, "DATABASE_URL": "postgresql+psycopg://new-placeholder"}  # SMTP kept,
    # and the empty topic ARN did not blank the existing one


@pytest.mark.parametrize("name", ["05-secrets-rds.sh", "09-weekly-brief.sh"])
def test_operator_scripts_keep_secret_values_off_command_lines_and_disk(name):
    text = (REPO / "infra" / "scripts" / name).read_text()
    assert not re.search(r"--secret-string \"\$(?!\(awspath)", text)  # only file:// inputs, never the value itself
    assert "umask 077" in text and re.search(r"trap 'rm -f [^']+' EXIT", text)
    assert "command -v python3 || command -v python" in text and not re.search(r"\| python -c", text)


def test_the_image_never_contains_a_dotenv_file():
    rules = [line.strip() for line in (REPO / "backend" / "Dockerfile.dockerignore").read_text().splitlines()
             if line.strip() and not line.startswith("#")]
    assert rules[0] == "**"  # everything is excluded first ...
    assert not any(r.startswith("!") and ".env" in r for r in rules)  # ... and no .env is let back in
    assert "COPY backend/.env" not in (REPO / "backend" / "Dockerfile").read_text()
