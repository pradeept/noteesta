from unittest.mock import Mock

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from src.auth.dependencies import current_user
from src.auth.security import validate_auth_settings
from src.config import get_settings
from src.main import app


def test_disabled_auth_configuration_and_routes(monkeypatch):
    monkeypatch.setattr(get_settings(), "noteesta_auth_enabled", False)
    monkeypatch.setattr(get_settings(), "app_env", "production")
    monkeypatch.setattr(get_settings(), "jwt_secret", "")
    validate_auth_settings()
    client = TestClient(app)
    response = client.get("/api/v1/config")
    assert response.json()["localUser"]["id"] == "local-workspace"
    assert response.headers["cache-control"] == "no-store"
    assert client.post("/api/v1/auth/register", json={}).status_code == 404


@pytest.mark.asyncio
async def test_local_identity_is_stable_and_server_owned(monkeypatch):
    monkeypatch.setattr(get_settings(), "noteesta_auth_enabled", False)
    assert (await current_user(Mock(), None))["_id"] == "local-workspace"
    assert (await current_user(Mock(), Mock(credentials="forged")))["_id"] == "local-workspace"


@pytest.mark.asyncio
async def test_auth_enabled_still_requires_credentials(monkeypatch):
    monkeypatch.setattr(get_settings(), "noteesta_auth_enabled", True)
    with pytest.raises(HTTPException) as error:
        await current_user(Mock(), None)
    assert error.value.status_code == 401
    assert TestClient(app).get("/api/v1/config").json() == {"authEnabled": True, "localUser": None}


def test_local_collections_survive_new_clients_and_exclude_account_data(monkeypatch):
    from types import SimpleNamespace

    from fakes import FakeTable

    from src.database import database_dependency

    monkeypatch.setattr(get_settings(), "noteesta_auth_enabled", False)
    database = SimpleNamespace(
        collections=FakeTable(
            [
                {
                    "_id": "private",
                    "user_id": "another-account",
                    "name": "Private",
                    "color": "moss",
                },
            ]
        )
    )
    monkeypatch.setitem(app.dependency_overrides, database_dependency, lambda: database)
    client = TestClient(app)
    created = client.post("/api/v1/collections", json={"name": "Local notes"})
    assert created.status_code == 201
    fresh_client = TestClient(app)
    items = fresh_client.get("/api/v1/collections", headers={"X-User-Id": "another-account"}).json()
    assert [item["name"] for item in items] == ["Local notes"]
    assert items[0]["id"] == created.json()["id"]
