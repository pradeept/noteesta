import asyncio
import json
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock
from urllib.parse import parse_qs, urlparse

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fakes import FakeTable
from fastapi import HTTPException, Response
from fastapi.testclient import TestClient

from src.auth import google, router, security, service
from src.auth.security import encode_token, now
from src.config import get_settings
from src.database import database_dependency
from src.main import app

EMAIL = "student@example.com"
PASSWORD = "a long study passphrase"
HEADERS = {"Origin": "http://localhost:3000", "X-Noteesta-Client": "web"}


@pytest.fixture
def auth_api(monkeypatch, tmp_path):
    database = SimpleNamespace(
        **{
            name: FakeTable()
            for name in (
                "users",
                "auth_sessions",
                "auth_email_tokens",
                "auth_oauth",
                "pills",
                "collections",
                "chunks",
                "pill_three_d",
            )
        }
    )
    monkeypatch.setattr(router, "rate_limit", AsyncMock())
    monkeypatch.setattr(google, "rate_limit", AsyncMock())
    monkeypatch.setattr(get_settings(), "local_email_directory", str(tmp_path))
    monkeypatch.setattr(get_settings(), "email_adapter", "local")
    monkeypatch.setitem(app.dependency_overrides, database_dependency, lambda: database)
    client = TestClient(app, headers=HEADERS)
    yield client, database, tmp_path
    client.close()


def last_token(directory, purpose="verify-email"):
    messages = sorted(directory.glob("*.json"), key=lambda file: file.stat().st_mtime_ns)
    for file in reversed(messages):
        message = json.loads(file.read_text())
        url = message["text"].split(": ", 1)[1].split("\n")[0]
        if purpose in url:
            return parse_qs(urlparse(url).query)["token"][0]
    raise AssertionError("No matching email")


def register(client, email=EMAIL):
    return client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": PASSWORD, "displayName": "Student"},
    )


def login(client):
    return client.post("/api/v1/auth/login", json={"email": EMAIL, "password": PASSWORD})


def verified_login(auth_api):
    client, _, directory = auth_api
    assert register(client).status_code == 202
    assert (
        client.post("/api/v1/auth/verify-email", json={"token": last_token(directory)}).status_code
        == 200
    )
    response = login(client)
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['accessToken']}"}


def test_registration_verification_and_login(auth_api):
    client, database, directory = auth_api
    assert register(client, "STUDENT@example.com").status_code == 202
    user = next(iter(database.users.documents.values()))
    assert user["email"] == EMAIL and user["password_hash"] != PASSWORD
    assert login(client).status_code == 403
    token = last_token(directory)
    assert token not in str(database.auth_email_tokens.documents)
    assert client.get(f"/api/v1/auth/verify-email?token={token}").status_code == 405
    assert client.post("/api/v1/auth/verify-email", json={"token": token}).status_code == 200
    assert client.post("/api/v1/auth/verify-email", json={"token": token}).status_code == 400
    response = login(client)
    assert response.json()["expiresIn"] == 900
    assert response.json()["user"]["loginMethods"] == ["password"]
    assert "password" not in str(
        {key: value for key, value in response.json().items() if key != "user"}
    )
    cookie = response.headers["set-cookie"]
    assert "HttpOnly" in cookie and "SameSite=lax" in cookie and "Path=/api/v1/auth" in cookie
    assert "refreshToken" not in response.json()
    assert response.headers["cache-control"] == "no-store"


def test_generic_registration_and_recovery_responses(auth_api):
    client, _, _ = auth_api
    first = register(client)
    assert register(client).json() == first.json()
    unknown = client.post("/api/v1/auth/forgot-password", json={"email": "unknown@example.com"})
    assert (
        unknown.json() == client.post("/api/v1/auth/forgot-password", json={"email": EMAIL}).json()
    )


@pytest.mark.parametrize(
    "headers",
    [
        {},
        {"Origin": "https://evil.example", "X-Noteesta-Client": "web"},
        {"Origin": "http://localhost:3000"},
    ],
)
def test_auth_rejects_disallowed_origins(auth_api, headers):
    client, _, _ = auth_api
    client.headers.clear()
    assert client.post("/api/v1/auth/refresh", headers=headers).status_code == 403


@pytest.mark.parametrize(
    "path",
    [
        "/pills",
        "/collections",
        "/library",
        "/models",
        "/pills/pill-1",
        "/pills/pill-1/three-d",
        "/library/source-1/download-url",
        "/auth/me",
    ],
)
def test_demo_header_is_not_authentication(auth_api, path):
    client, _, _ = auth_api
    assert client.get(f"/api/v1{path}", headers={"X-User-Id": "demo-user"}).status_code == 401


def test_rotation_replay_and_logout(auth_api):
    client, _, _ = auth_api
    old_headers = verified_login(auth_api)
    original = client.cookies.get(service.COOKIE_NAME)
    response = client.post("/api/v1/auth/refresh")
    assert response.status_code == 200
    assert client.cookies.get(service.COOKIE_NAME) != original
    assert client.get("/api/v1/auth/me", headers=old_headers).status_code == 200
    replay = client.post(
        "/api/v1/auth/refresh", headers={"Cookie": f"{service.COOKIE_NAME}={original}"}
    )
    assert replay.status_code == 401
    assert client.get("/api/v1/auth/me", headers=old_headers).status_code == 401
    assert client.post("/api/v1/auth/logout").status_code == 204


def test_logout_revokes_access_immediately(auth_api):
    client, _, _ = auth_api
    headers = verified_login(auth_api)
    assert client.post("/api/v1/auth/logout").status_code == 204
    assert client.get("/api/v1/auth/me", headers=headers).status_code == 401


def test_multiple_devices_and_logout_everywhere(auth_api):
    client, _, _ = auth_api
    first = verified_login(auth_api)
    second = {"Authorization": f"Bearer {login(client).json()['accessToken']}"}
    assert client.get("/api/v1/auth/me", headers=first).status_code == 200
    assert client.post("/api/v1/auth/logout-all", headers=second).status_code == 204
    assert client.get("/api/v1/auth/me", headers=first).status_code == 401
    assert client.get("/api/v1/auth/me", headers=second).status_code == 401


def test_password_reset_revokes_sessions_and_other_links(auth_api):
    client, _, directory = auth_api
    headers = verified_login(auth_api)
    assert client.post("/api/v1/auth/forgot-password", json={"email": EMAIL}).status_code == 202
    first = last_token(directory, "reset-password")
    assert client.post("/api/v1/auth/forgot-password", json={"email": EMAIL}).status_code == 202
    second = last_token(directory, "reset-password")
    payload = {"token": first, "password": "my new long passphrase"}
    assert client.post("/api/v1/auth/reset-password", json=payload).status_code == 200
    assert (
        client.post("/api/v1/auth/reset-password", json={**payload, "token": second}).status_code
        == 400
    )
    assert client.get("/api/v1/auth/me", headers=headers).status_code == 401
    assert login(client).status_code == 401
    assert (
        client.post(
            "/api/v1/auth/login", json={"email": EMAIL, "password": payload["password"]}
        ).status_code
        == 200
    )


def test_expired_email_token(auth_api):
    client, database, directory = auth_api
    register(client)
    next(iter(database.auth_email_tokens.documents.values()))["expires_at"] = now() - timedelta(
        seconds=1
    )
    assert (
        client.post("/api/v1/auth/verify-email", json={"token": last_token(directory)}).status_code
        == 400
    )


def test_access_token_validation_and_cross_user_resources(auth_api):
    client, database, _ = auth_api
    headers = verified_login(auth_api)
    user = next(iter(database.users.documents.values()))
    session = next(iter(database.auth_sessions.documents.values()))
    for token in (
        "invalid",
        encode_token(user["_id"], session["_id"], "refresh", now() + timedelta(minutes=1)),
        encode_token(user["_id"], session["_id"], "access", now() - timedelta(seconds=1)),
    ):
        assert (
            client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code
            == 401
        )
    database.pills.documents["other"] = {
        "_id": "other",
        "user_id": "someone-else",
        "title": "Private",
        "sources": [],
    }
    assert client.get("/api/v1/pills", headers=headers).json() == []
    assert client.get("/api/v1/pills/other", headers=headers).status_code == 404
    assert client.get("/api/v1/library/other/download-url", headers=headers).status_code == 404
    assert (
        client.patch("/api/v1/pills/other", json={"title": "Stolen"}, headers=headers).status_code
        == 404
    )


@pytest.mark.asyncio
async def test_google_linking_invalidates_unverified_password(auth_api):
    client, database, directory = auth_api
    register(client)
    token = last_token(directory)
    identity = {"sub": "google-1", "email": EMAIL, "name": "Student", "email_verified": True}
    linked = await google.link_google(database, identity)
    assert linked["email_verified"] and linked["password_hash"] is None
    assert (await google.link_google(database, identity))["_id"] == linked["_id"]
    assert login(client).status_code == 401
    assert client.post("/api/v1/auth/verify-email", json={"token": token}).status_code == 400


@pytest.mark.asyncio
async def test_verified_google_link_preserves_password(auth_api):
    _, database, _ = auth_api
    verified_login(auth_api)
    user = next(iter(database.users.documents.values()))
    linked = await google.link_google(database, {"sub": "google-1", "email": EMAIL})
    assert linked["_id"] == user["_id"] and linked["password_hash"] == user["password_hash"]
    assert service.public_user(linked).login_methods == ["password", "google"]


def test_google_state_pkce_binding_and_callback(auth_api, monkeypatch):
    client, database, _ = auth_api
    monkeypatch.setattr(get_settings(), "google_client_id", "client-id")
    monkeypatch.setattr(get_settings(), "google_client_secret", "client-secret")
    response = client.get(
        "/api/v1/auth/google/start?return_to=//evil.example", follow_redirects=False
    )
    params = parse_qs(urlparse(response.headers["location"]).query)
    assert params["code_challenge_method"] == ["S256"] and params["code_challenge"]
    assert "code_verifier" not in params
    callback = f"/api/v1/auth/google/callback?state={params['state'][0]}&code=code"
    binding = client.cookies.get(google.STATE_COOKIE)
    client.cookies.clear()
    assert "/login?error=" in client.get(callback, follow_redirects=False).headers["location"]
    assert database.auth_oauth.documents  # Missing binding cannot consume the real transaction.
    client.cookies.set(google.STATE_COOKIE, binding, path="/api/v1/auth/google")
    monkeypatch.setattr(
        google,
        "google_identity",
        AsyncMock(return_value={"sub": "google-1", "email": EMAIL, "email_verified": True}),
    )
    result = client.get(callback, follow_redirects=False)
    assert "/auth/callback?returnTo=%2Fworkspace" in result.headers["location"]
    assert client.post("/api/v1/auth/refresh").status_code == 200
    assert "/login?error=" in client.get(callback, follow_redirects=False).headers["location"]


@pytest.mark.asyncio
async def test_atomic_refresh_reuse_detection(auth_api):
    _, database, _ = auth_api
    verified_login(auth_api)
    user = next(iter(database.users.documents.values()))
    response = Response()
    await service.new_session(database, user, response)
    token = response.headers["set-cookie"].split("=", 1)[1].split(";", 1)[0]
    results = await asyncio.gather(
        service.rotate_session(database, token, Response()),
        service.rotate_session(database, token, Response()),
        return_exceptions=True,
    )
    assert sum(isinstance(result, HTTPException) for result in results) == 1


@pytest.mark.asyncio
async def test_rate_limit_uses_redis_and_fails_closed(monkeypatch):
    store = SimpleNamespace(eval=AsyncMock(return_value=99))
    monkeypatch.setattr(security, "rate_store", lambda: store)
    request = SimpleNamespace(client=SimpleNamespace(host="127.0.0.1"))
    with pytest.raises(HTTPException) as error:
        await security.rate_limit(request, "login", EMAIL)
    assert error.value.status_code == 429


def test_production_settings_reject_missing_secret(monkeypatch):
    monkeypatch.setattr(get_settings(), "app_env", "production")
    monkeypatch.setattr(get_settings(), "jwt_secret", "")
    with pytest.raises(RuntimeError):
        security.validate_auth_settings()


@pytest.mark.asyncio
@pytest.mark.parametrize("change", [None, "issuer", "audience", "nonce", "expired", "unverified"])
async def test_google_validates_signed_identity_claims(monkeypatch, change):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(key.public_key()))
    public["kid"] = "test-key"
    claims = {
        "iss": google.GOOGLE_ISSUER,
        "aud": "test-client",
        "sub": "google-1",
        "iat": now(),
        "exp": now() + timedelta(minutes=10),
        "nonce": "correct-nonce",
        "email": EMAIL,
        "email_verified": True,
    }
    if change == "issuer":
        claims["iss"] = "https://evil.example"
    if change == "audience":
        claims["aud"] = "other-client"
    if change == "nonce":
        claims["nonce"] = "wrong-nonce"
    if change == "expired":
        claims["exp"] = now() - timedelta(minutes=1)
    if change == "unverified":
        claims["email_verified"] = False
    encoded = jwt.encode(claims, key, algorithm="RS256", headers={"kid": "test-key"})

    class Client:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            pass

        async def fetch_token(self, *_args, **_kwargs):
            return {"id_token": encoded}

        async def get(self, *_args):
            return SimpleNamespace(json=lambda: {"keys": [public]})

    monkeypatch.setattr(get_settings(), "google_client_id", "test-client")
    monkeypatch.setattr(google, "google_client", Client)
    request = SimpleNamespace(query_params={"code": "test-code"})
    if change is None:
        assert (
            await google.google_identity(request, {"verifier": "test", "nonce": "correct-nonce"})
        )["sub"] == "google-1"
    else:
        with pytest.raises((jwt.PyJWTError, ValueError)):
            await google.google_identity(request, {"verifier": "test", "nonce": "correct-nonce"})


@pytest.mark.asyncio
async def test_redis_failure_returns_service_unavailable(monkeypatch):
    from redis.exceptions import RedisError

    monkeypatch.setattr(
        security, "rate_store", lambda: SimpleNamespace(eval=AsyncMock(side_effect=RedisError()))
    )
    with pytest.raises(HTTPException) as error:
        await security.rate_limit(
            SimpleNamespace(client=SimpleNamespace(host="localhost")), "login"
        )
    assert error.value.status_code == 503


@pytest.mark.asyncio
async def test_resend_delivery_failure_is_recoverable(monkeypatch):
    from src.auth.email import send_account_email

    monkeypatch.setattr(get_settings(), "email_adapter", "resend")
    monkeypatch.setattr(
        httpx.AsyncClient, "post", AsyncMock(side_effect=httpx.ConnectError("offline"))
    )
    with pytest.raises(HTTPException) as error:
        await send_account_email(EMAIL, "single-use-test-token", "verify")
    assert error.value.status_code == 503


@pytest.mark.asyncio
async def test_local_reset_dry_run_is_read_only(monkeypatch, tmp_path):
    from unittest.mock import Mock

    from src.auth import reset_local

    settings = get_settings()
    for key, value in {
        "app_env": "development",
        "mongodb_uri": "mongodb://localhost:27017",
        "mongodb_database": "noteesta",
        "redis_url": "redis://localhost:6379/0",
        "s3_endpoint_url": "http://localhost:8333",
        "local_email_directory": ".local/emails",
    }.items():
        monkeypatch.setattr(settings, key, value)
    monkeypatch.chdir(tmp_path)
    tables = {
        name: SimpleNamespace(count_documents=AsyncMock(return_value=2), delete_many=AsyncMock())
        for name in reset_local.TABLES
    }
    storage = SimpleNamespace(bucket="noteesta", delete_object=AsyncMock(), client=Mock())
    storage.client.get_paginator.return_value.paginate.return_value = [
        {"Contents": [{"Key": "users/student-1/original.txt"}]}
    ]
    monkeypatch.setattr(reset_local, "get_database", lambda: tables)
    monkeypatch.setattr(reset_local, "get_storage", lambda: storage)
    result = await reset_local.reset("noteesta", execute=False)
    assert result["objectsUnderUsersPrefix"] == 1 and result["execute"] is False
    storage.delete_object.assert_not_called()
    for table in tables.values():
        table.delete_many.assert_not_called()
    monkeypatch.setattr(settings, "mongodb_uri", "mongodb+srv://shared.example/")
    with pytest.raises(RuntimeError):
        reset_local.validate_target("noteesta")
