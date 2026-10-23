from app import storage


def test_archive_is_skipped_without_bucket(monkeypatch):
    monkeypatch.delenv("S3_BUCKET", raising=False)
    assert storage.archive_json("inbox", "x", {"a": 1}) is None


def test_archive_puts_object_when_bucket_set(monkeypatch):
    calls = {}

    class FakeS3:
        def put_object(self, **kwargs):
            calls.update(kwargs)

    import boto3
    monkeypatch.setenv("S3_BUCKET", "deliverylens-data-test")
    monkeypatch.setattr(boto3, "client", lambda *a, **k: FakeS3())
    uri = storage.archive_json("inbox", "run-1", {"a": 1})
    assert uri.startswith("s3://deliverylens-data-test/inbox/") and uri.endswith("/run-1.json")
    assert calls["Bucket"] == "deliverylens-data-test" and calls["ServerSideEncryption"] == "AES256"


def test_archive_failure_does_not_raise(monkeypatch):
    import boto3

    def boom(*a, **k):
        raise RuntimeError("no network")

    monkeypatch.setenv("S3_BUCKET", "b")
    monkeypatch.setattr(boto3, "client", boom)
    assert storage.archive_json("inbox", "x", {}) is None
