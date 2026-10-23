"""Archive agent inputs and outputs to Amazon S3 (raw zone of the data bucket).

Does nothing when S3_BUCKET is not set, so local runs and tests stay offline.
"""
import json
import logging
import os
from datetime import datetime, timezone

log = logging.getLogger(__name__)


def archive_json(prefix: str, name: str, payload: dict) -> str | None:
    """Write `payload` to s3://$S3_BUCKET/<prefix>/<yyyy-mm-dd>/<name>.json and return the URI."""
    bucket = os.getenv("S3_BUCKET")
    if not bucket:
        return None
    key = f"{prefix}/{datetime.now(timezone.utc):%Y-%m-%d}/{name}.json"
    try:
        import boto3

        boto3.client("s3", region_name=os.getenv("AWS_REGION")).put_object(
            Bucket=bucket, Key=key, Body=json.dumps(payload, default=str).encode(),
            ContentType="application/json", ServerSideEncryption="AES256",
        )
    except Exception:  # archiving must never break the user's request
        log.exception("S3 archive failed for %s", key)
        return None
    return f"s3://{bucket}/{key}"
