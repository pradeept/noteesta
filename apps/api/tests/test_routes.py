from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest
from fakes import FakeTable
from fastapi.testclient import TestClient

from src import generation
from src.database import database_dependency
from src.dependencies.profile import current_user_id
from src.health import router as health_routes
from src.library import router as library_routes
from src.main import app
from src.pills import router as pill_routes


@pytest.fixture
def api(monkeypatch):
    database = SimpleNamespace(
        pills=FakeTable(
            [
                {
                    "_id": "pill-1",
                    "user_id": "student-1",
                    "title": "Cells",
                    "subject": "Biology",
                    "sources": [
                        {
                            "id": "source-1",
                            "name": "notes.txt",
                            "kind": "document",
                            "detail": "1 KB",
                            "object_key": "users/student-1/notes.txt",
                        }
                    ],
                }
            ]
        ),
        collections=FakeTable(),
    )
    storage = SimpleNamespace(
        put_bytes=AsyncMock(),
        delete_object=AsyncMock(),
        presigned_url=AsyncMock(return_value="https://storage.example/notes.txt"),
    )
    queue = Mock()
    monkeypatch.setattr(pill_routes, "get_storage", lambda: storage)
    monkeypatch.setattr(library_routes, "get_storage", lambda: storage)
    monkeypatch.setattr(pill_routes, "require_available_generation", AsyncMock())
    monkeypatch.setattr(pill_routes.process_pill_task, "delay", queue)
    monkeypatch.setattr(
        generation,
        "_installed_models",
        AsyncMock(
            return_value={
                generation.get_settings().ollama_model,
                generation.get_settings().ollama_embedding_model,
            }
        ),
    )
    monkeypatch.setitem(app.dependency_overrides, database_dependency, lambda: database)
    monkeypatch.setitem(app.dependency_overrides, current_user_id, lambda: "student-1")
    client = TestClient(app)
    try:
        yield client, database, storage, queue
    finally:
        client.close()


@pytest.mark.parametrize("source_kind", ["file", "youtube"])
def test_create_pill_persists_sources_and_queues_processing(api, source_kind):
    client, database, storage, queue = api
    form = {"title": "New pill", "subject": "Biology"}
    upload = {}
    if source_kind == "file":
        upload["files"] = ("notes.txt", b"Cell biology", "text/plain")
    else:
        form["youtube_url"] = "https://youtube.com/watch?v=lesson"

    response = client.post("/api/v1/pills", data=form, files=upload)

    assert response.status_code == 202
    body = response.json()
    assert "userId" not in body
    assert "objectKey" not in body["sources"][0]
    document = database.pills.documents[body["id"]]
    source = document["sources"][0]
    if source_kind == "file":
        storage.put_bytes.assert_awaited_once()
        assert source["object_key"] == storage.put_bytes.call_args.args[0]
    else:
        storage.put_bytes.assert_not_awaited()
        assert source["url"] == form["youtube_url"]
        assert source["original_available"] is False
    queue.assert_called_once_with(body["id"])


@pytest.mark.parametrize("collection_owner", [None, "student-2"])
def test_collection_assignment_rejects_missing_or_unowned_collection(api, collection_owner):
    client, database, _, _ = api
    if collection_owner:
        database.collections.documents["collection-1"] = {
            "_id": "collection-1",
            "user_id": collection_owner,
            "name": "Private",
        }

    response = client.patch("/api/v1/pills/pill-1", json={"collectionId": "collection-1"})

    assert response.status_code == 404
    assert "collection_id" not in database.pills.documents["pill-1"]
    assert "collectionId" not in database.pills.documents["pill-1"]


def test_collection_assignment_bulk_move_and_deletion_share_database_field(api):
    client, database, _, _ = api
    response = client.post("/api/v1/collections", json={"name": "Biology", "color": "ocean"})
    assert response.status_code == 201
    collection_id = response.json()["id"]
    response = client.patch("/api/v1/pills/pill-1", json={"collectionId": collection_id})
    assert response.status_code == 200
    assert response.json()["collectionId"] == collection_id
    assert database.pills.documents["pill-1"]["collection_id"] == collection_id
    assert "collectionId" not in database.pills.documents["pill-1"]

    response = client.patch(
        "/api/v1/pills/bulk/collection", json={"pillIds": ["pill-1"], "collectionId": None}
    )
    assert response.status_code == 200
    assert response.json()[0]["collectionId"] is None
    response = client.patch("/api/v1/pills/pill-1", json={"collectionId": collection_id})
    assert response.status_code == 200
    assert client.delete(f"/api/v1/collections/{collection_id}").status_code == 204
    assert client.get("/api/v1/pills/pill-1").json()["collectionId"] is None
    assert database.pills.documents["pill-1"]["collection_id"] is None


def test_library_download_and_delete_work_with_deserialized_sources(api):
    client, database, storage, _ = api
    response = client.get("/api/v1/library")
    assert response.status_code == 200
    assert response.json()[0]["sourceId"] == "source-1"
    response = client.get("/api/v1/library/source-1/download", follow_redirects=False)
    assert response.status_code == 307
    assert response.headers["location"] == "https://storage.example/notes.txt"
    response = client.delete("/api/v1/library/source-1")
    assert response.status_code == 200
    assert response.json()["originalAvailable"] is False
    storage.delete_object.assert_awaited_once_with("users/student-1/notes.txt")
    assert database.pills.documents["pill-1"]["sources"][0]["original_available"] is False
    assert client.get("/api/v1/library/source-1/download").status_code == 410


def test_models_route_returns_generation_options(api):
    client, _, _, _ = api
    response = client.get("/api/v1/models")
    assert response.status_code == 200
    assert response.json()[0]["available"] is True


def test_library_download_url_uses_short_expiry(api):
    client, _, storage, _ = api
    response = client.get("/api/v1/library/source-1/download-url")
    assert response.status_code == 200
    assert response.json() == {"url": "https://storage.example/notes.txt", "expiresIn": 300}
    storage.presigned_url.assert_awaited_once_with("users/student-1/notes.txt", expires=300)


def test_healthz_route_matches_compose_healthcheck(api, monkeypatch):
    client, _, _, _ = api
    monkeypatch.setattr(health_routes, "ping_database", AsyncMock(return_value=True))
    monkeypatch.setattr(
        health_routes, "ObjectStorage", lambda: SimpleNamespace(ping=AsyncMock(return_value=True))
    )
    monkeypatch.setattr(
        health_routes.celery_app.control,
        "inspect",
        lambda: SimpleNamespace(ping=lambda: {"worker": {"ok": "pong"}}),
    )
    response = client.get("/api/v1/healthz")
    assert response.status_code == 200
    assert response.json()["status"] == "ready"
