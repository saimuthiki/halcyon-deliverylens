#!/usr/bin/env python3
"""Merge the SMTP settings from backend/.env into the app secret (AWS Secrets Manager, boto3). Dry run by default.

    python infra/scripts/10-smtp-secret.py            # shows what would change (key names only)
    python infra/scripts/10-smtp-secret.py --apply    # writes, then re-reads and verifies

- Reads SMTP_HOST, SMTP_PORT, SMTP_SECURITY, SMTP_USERNAME and SMTP_PASSWORD from backend/.env (gitignored).
  Nothing from that file is printed, logged or passed on a command line.
- Never creates the secret: a missing secret means the deployment is not set up (run 05-secrets-rds.sh first),
  and an SMTP-only secret would break the API.
- Keeps every existing field; only the five SMTP_* keys are added or replaced. Refuses to write if the secret
  changed since it was read.
- Checks it is talking to the expected AWS account before reading anything.
- Prints key names, account, region and secret name only; never a value.
"""
import argparse
import json
import sys
import uuid
from pathlib import Path

SMTP_KEYS = ("SMTP_HOST", "SMTP_PORT", "SMTP_SECURITY", "SMTP_USERNAME", "SMTP_PASSWORD")
APP_SECRET_MARKER = "DATABASE_URL"  # every deliverylens/app secret has it; guards against the wrong secret
REPO = Path(__file__).resolve().parents[2]


class Abort(Exception):
    pass


def read_env_file(path: Path) -> dict[str, str]:
    """The SMTP_* keys from a KEY=VALUE file (comments, blank lines, `export`, quotes and spaces around `=`
    are handled). Other keys are ignored."""
    if not path.is_file():
        raise Abort(f"{path} not found")
    out = {}
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        key = key.strip().removeprefix("export ").strip()
        val = val.strip()
        if len(val) >= 2 and val[0] == val[-1] and val[0] in "'\"":
            val = val[1:-1]
        if key in SMTP_KEYS:
            out[key] = val
    return out


def validate(smtp: dict[str, str]) -> list[str]:
    """Problems with the SMTP settings, without echoing any value."""
    errors = [f"{k} is missing or empty" for k in SMTP_KEYS if not smtp.get(k)]
    port, security = smtp.get("SMTP_PORT", ""), smtp.get("SMTP_SECURITY", "").lower()
    if port and not (port.isdigit() and 0 < int(port) < 65536):
        errors.append("SMTP_PORT is not a port number")
    if security and security not in ("starttls", "ssl"):
        errors.append("SMTP_SECURITY must be starttls or ssl")
    if (security, port) in (("starttls", "465"), ("ssl", "587")):
        errors.append("SMTP_SECURITY does not match SMTP_PORT (starttls uses 587, ssl uses 465)")
    if smtp.get("SMTP_HOST") and any(c.isspace() for c in smtp["SMTP_HOST"]):
        errors.append("SMTP_HOST contains spaces")
    return errors


def merge(existing: dict, smtp: dict[str, str]) -> dict:
    """Every existing field, plus the SMTP_* keys (added or replaced). Never fewer keys than before."""
    merged = dict(existing)
    merged.update({k: smtp[k] for k in SMTP_KEYS})
    return merged


def plan(existing: dict, merged: dict) -> dict:
    """Key names only: which SMTP keys are added, changed or unchanged, and how many other keys are kept."""
    return {"added": [k for k in SMTP_KEYS if k not in existing],
            "changed": [k for k in SMTP_KEYS if k in existing and existing[k] != merged[k]],
            "unchanged": [k for k in SMTP_KEYS if k in existing and existing[k] == merged[k]],
            "kept_other_keys": len([k for k in existing if k not in SMTP_KEYS])}


def load_secret(sm, secret_id: str) -> tuple[dict, str]:
    try:
        resp = sm.get_secret_value(SecretId=secret_id)
    except sm.exceptions.ResourceNotFoundException:
        raise Abort(f"secret {secret_id} does not exist; not creating it (run infra/scripts/05-secrets-rds.sh first)") from None
    try:
        data = json.loads(resp["SecretString"])
    except (KeyError, json.JSONDecodeError):
        raise Abort(f"secret {secret_id} is not JSON text; not touching it") from None
    if not isinstance(data, dict) or APP_SECRET_MARKER not in data:
        raise Abort(f"secret {secret_id} does not look like the app secret (no {APP_SECRET_MARKER}); not touching it")
    return data, resp["VersionId"]


def verify(after: dict, before: dict, smtp: dict[str, str]) -> list[str]:
    """Problems in the re-read secret: a lost or changed non-SMTP field, or an SMTP value that did not land."""
    problems = [f"{k} was lost or changed" for k in before if k not in SMTP_KEYS and after.get(k) != before[k]]
    problems += [f"{k} does not match backend/.env" for k in SMTP_KEYS if after.get(k) != smtp[k]]
    return problems


def run(session, *, secret_id: str, expect_account: str, env_file: Path, apply: bool, out=print) -> int:
    smtp = read_env_file(env_file)
    errors = validate(smtp)
    if errors:
        raise Abort("backend/.env: " + "; ".join(errors))
    account = session.client("sts").get_caller_identity()["Account"]
    if account != expect_account:
        raise Abort(f"signed in to account {account}, expected {expect_account} (use --profile infinity-stacks)")
    sm = session.client("secretsmanager")
    existing, version = load_secret(sm, secret_id)
    merged = merge(existing, smtp)
    p = plan(existing, merged)
    out(f"account {account}, region {session.region_name}, secret {secret_id}")
    out(f"SMTP keys added: {p['added'] or '-'}; changed: {p['changed'] or '-'}; unchanged: {p['unchanged'] or '-'}")
    out(f"other keys kept as they are: {p['kept_other_keys']}")
    if not p["added"] and not p["changed"]:
        out("nothing to change")
        return 0
    if not apply:
        out("dry run: nothing written (add --apply to write)")
        return 0
    if load_secret(sm, secret_id)[1] != version:
        raise Abort("the secret changed while this ran; run it again")
    sm.put_secret_value(SecretId=secret_id, SecretString=json.dumps(merged), ClientRequestToken=str(uuid.uuid4()))
    after, _ = load_secret(sm, secret_id)
    problems = verify(after, existing, smtp)
    if problems:
        raise Abort("written, but verification failed: " + "; ".join(problems))
    out(f"written and verified: {len(after)} keys; the 5 SMTP keys match backend/.env; every other key unchanged")
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--apply", action="store_true", help="write the merged secret (default: dry run)")
    ap.add_argument("--profile", default="infinity-stacks")
    ap.add_argument("--region", default="us-east-1")
    ap.add_argument("--secret-id", default="deliverylens/app")
    ap.add_argument("--expect-account", default="781547812451")
    ap.add_argument("--env-file", type=Path, default=REPO / "backend" / ".env")
    args = ap.parse_args(argv)
    import boto3

    try:
        return run(boto3.Session(profile_name=args.profile, region_name=args.region), secret_id=args.secret_id,
                   expect_account=args.expect_account, env_file=args.env_file, apply=args.apply)
    except Abort as exc:
        print(f"stopped: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
