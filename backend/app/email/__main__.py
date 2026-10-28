"""python -m app.email check

Checks the SMTP settings (SMTP_HOST, SMTP_PORT, SMTP_SECURITY, SMTP_USERNAME, SMTP_PASSWORD): connects, secures the
connection, logs in and quits. It never sends an email and never prints the credentials. Works whatever
EMAIL_BACKEND is, so the relay can be checked from the server before switching to it.
"""
import json
import sys

from app.config import get_settings
from app.email.service import EmailConfigError, _smtp_backend


def main(argv: list[str]) -> int:
    if argv != ["check"]:
        print("usage: python -m app.email check")
        return 2
    try:
        result = _smtp_backend(get_settings()).check()
    except EmailConfigError as exc:
        result = {"ok": False, "stage": "config", "error": str(exc)}
    print(json.dumps(result))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
