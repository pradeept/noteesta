from datetime import UTC, datetime
from urllib.parse import parse_qs, urlsplit

import boto3
import pytest
from botocore.stub import Stubber

from src.config import Settings
from src.storage import ObjectStorage


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("endpoint", "public_endpoint"),
    [
        ("http://localhost:8333", ""),
        ("https://s3.eu-west-1.amazonaws.com", ""),
        ("http://seaweedfs:8333", "http://localhost:8333"),
        ("http://storage.internal:9000", "https://files.example.com"),
    ],
)
async def test_signed_urls_preserve_s3_behavior_and_sign_for_public_endpoint(
    monkeypatch, endpoint, public_endpoint
):
    settings = Settings(
        _env_file=None,
        s3_endpoint_url=endpoint,
        s3_public_endpoint_url=public_endpoint,
        s3_access_key_id="test-access",
        s3_secret_access_key="test-secret",
        s3_bucket="study-files",
        s3_region="eu-west-1",
    )
    monkeypatch.setattr("src.storage.get_settings", lambda: settings)
    monkeypatch.setattr(
        "botocore.auth.get_current_datetime", lambda: datetime(2026, 11, 17, tzinfo=UTC)
    )
    storage = ObjectStorage()
    key = "users/local-workspace/originals/notes + résumé.pdf"
    try:
        assert storage.client.meta.endpoint_url == endpoint
        if not public_endpoint:
            assert storage.download_client is storage.client
        # Compare with an independently signed URL, including credentials, path,
        # expiry and signature, to catch accidental post-signing rewrites.
        signer = boto3.client(
            "s3",
            endpoint_url=public_endpoint or endpoint,
            aws_access_key_id="test-access",
            aws_secret_access_key="test-secret",
            region_name="eu-west-1",
            use_ssl=False,
        )
        try:
            expected = signer.generate_presigned_url(
                "get_object", Params={"Bucket": "study-files", "Key": key}, ExpiresIn=300
            )
            actual = await storage.presigned_url(key, expires=300)
            assert actual == expected
            query = parse_qs(urlsplit(actual).query)
            assert "X-Amz-Signature" in query or "Signature" in query
        finally:
            signer.close()
        # Uploads still use the internal client, even with a public override.
        with Stubber(storage.client) as stub:
            stub.add_response(
                "put_object",
                {},
                {
                    "Bucket": "study-files",
                    "Key": key,
                    "Body": b"notes",
                    "ContentType": "text/plain",
                },
            )
            await storage.put_bytes(key, b"notes", "text/plain")
            stub.assert_no_pending_responses()
    finally:
        storage.client.close()
        if storage.download_client is not storage.client:
            storage.download_client.close()
