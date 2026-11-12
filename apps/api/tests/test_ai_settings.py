import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from cryptography.fernet import Fernet
from fakes import FakeTable
from fastapi.testclient import TestClient

from src import ai_settings, generation
from src.config import Settings
from src.database import database_dependency
from src.dependencies.profile import current_user_id
from src.main import app
from src.models.schemas import GenerationSelection, default_generation
from src.settings import router as settings_routes


@pytest.fixture
def account_api(monkeypatch):
    database = SimpleNamespace(
        provider_credentials=FakeTable(), ai_settings=FakeTable(), pills=FakeTable()
    )
    identity = {"id": "alice"}
    monkeypatch.setenv("OPENAI_API_KEY", "server-key-must-never-be-used")
    settings = Settings(
        _env_file=None,
        provider_keys_encryption_key=Fernet.generate_key().decode(),
    )
    monkeypatch.setattr(ai_settings, "get_settings", lambda: settings)
    monkeypatch.setattr(generation, "get_settings", lambda: settings)
    monkeypatch.setattr(
        generation,
        "_installed_models",
        AsyncMock(
            return_value={
                settings.ollama_model,
                settings.ollama_embedding_model,
            }
        ),
    )
    monkeypatch.setitem(app.dependency_overrides, database_dependency, lambda: database)
    monkeypatch.setitem(app.dependency_overrides, current_user_id, lambda: identity["id"])
    with TestClient(app) as client:
        # Do not start the real infrastructure lifespan in this fixture.
        yield client, database, identity, settings


# TestClient as a context manager runs lifespan; use dependency overrides without
# entering it, like the existing route tests.
@pytest.fixture(autouse=True)
def no_real_lifespan(monkeypatch):
    from contextlib import asynccontextmanager

    @asynccontextmanager
    async def lifespan(_app):
        yield

    monkeypatch.setattr(app.router, "lifespan_context", lifespan)


def test_encrypted_keys_are_isolated_replaceable_and_never_returned(account_api):
    client, db, identity, _ = account_api
    secret = "personal-key-secret-1234"
    assert (
        client.patch("/api/v1/settings/ai/providers/openai", json={"apiKey": secret}).status_code
        == 204
    )
    row = next(iter(db.provider_credentials.documents.values()))
    assert secret not in str(row)
    assert row["suffix"] == "1234"
    body = client.get("/api/v1/settings/ai").json()
    assert secret not in json.dumps(body)
    assert "encrypted" not in json.dumps(body)
    assert body["providers"][0]["configured"]
    assert any(model["provider"] == "openai" and model["available"] for model in body["models"])
    identity["id"] = "bob"
    assert not client.get("/api/v1/settings/ai").json()["providers"][0]["configured"]
    assert all(
        not model["available"]
        for model in client.get("/api/v1/models").json()
        if model["provider"] == "openai"
    )
    assert client.delete("/api/v1/settings/ai/providers/openai").status_code == 204
    assert len(db.provider_credentials.documents) == 1
    identity["id"] = "alice"
    assert (
        client.patch(
            "/api/v1/settings/ai/providers/openai", json={"apiKey": "replacement-key-5678"}
        ).status_code
        == 204
    )
    assert len(db.provider_credentials.documents) == 1
    assert next(iter(db.provider_credentials.documents.values()))["suffix"] == "5678"
    assert client.delete("/api/v1/settings/ai/providers/openai").status_code == 204
    assert not db.provider_credentials.documents


@pytest.mark.parametrize(
    "payload",
    [
        {"apiKey": "secret with spaces"},
        {"apiKey": {"value": "hidden-sensitive-secret"}},
        {"apiKey": "short"},
        {"apiKey": "sensitive" * 1000},
    ],
)
def test_invalid_keys_are_redacted(account_api, payload):
    client, _, _, _ = account_api
    response = client.patch("/api/v1/settings/ai/providers/openai", json=payload)
    assert response.status_code == 422
    assert str(payload["apiKey"]) not in response.text
    assert "input" not in response.text


def test_malformed_json_and_invalid_provider_do_not_echo_key(account_api):
    client, _, _, _ = account_api
    secret = "sensitive-key-1234"
    response = client.patch("/api/v1/settings/ai/providers/openai", content='{"apiKey":"' + secret)
    assert response.status_code == 422 and secret not in response.text
    response = client.patch("/api/v1/settings/ai/providers/unknown", json={"apiKey": secret})
    assert response.status_code == 422 and secret not in response.text


def test_default_is_account_scoped_and_only_accepts_presets(account_api):
    client, _, identity, _ = account_api
    chosen = {"provider": "anthropic", "model": "claude-opus-5-5"}
    assert (
        client.patch("/api/v1/settings/ai", json={"defaultGeneration": chosen}).status_code == 200
    )
    assert client.get("/api/v1/settings/ai").json()["defaultGeneration"] == chosen
    identity["id"] = "bob"
    assert client.get("/api/v1/settings/ai").json()["defaultGeneration"]["provider"] == "ollama"
    chosen["model"] = "arbitrary-model"
    assert (
        client.patch("/api/v1/settings/ai", json={"defaultGeneration": chosen}).status_code == 422
    )


def test_missing_encryption_keeps_ollama_usable(account_api):
    client, _, _, settings = account_api
    # Use a real SecretStr to exercise missing configuration rather than type errors.
    from pydantic import SecretStr

    settings.provider_keys_encryption_key = SecretStr("")
    response = client.get("/api/v1/settings/ai")
    assert response.status_code == 200 and not response.json()["keysEnabled"]
    assert response.json()["models"][0]["available"]
    assert (
        client.patch(
            "/api/v1/settings/ai/providers/openai", json={"apiKey": "personal-key-1234"}
        ).status_code
        == 503
    )


@pytest.mark.asyncio
async def test_missing_key_alone_falls_back_and_bad_ciphertext_does_not(account_api):
    _, db, _, _ = account_api
    chosen = GenerationSelection(provider="openai", model="gpt-6-astra")
    effective, client = await generation.resolve_generation(db, "alice", chosen)
    assert effective == default_generation()
    assert isinstance(client, generation.OllamaAdapter)
    await ai_settings.save_key(db, "alice", "openai", "personal-key-1234")
    effective, client = await generation.resolve_generation(db, "alice", chosen)
    assert effective == chosen and client._api_key == "personal-key-1234"
    assert isinstance(client, generation.OpenAIAdapter)
    # Removal before a queued job executes is observed on the next resolution.
    await ai_settings.delete_key(db, "alice", "openai")
    assert (await generation.resolve_generation(db, "alice", chosen))[0] == default_generation()
    await ai_settings.save_key(db, "alice", "openai", "personal-key-1234")
    next(iter(db.provider_credentials.documents.values()))["encrypted_key"] = "corrupted"
    with pytest.raises(ai_settings.CredentialError, match="could not be decrypted"):
        await generation.resolve_generation(db, "alice", chosen)


@pytest.mark.asyncio
async def test_embedding_and_fallback_availability_are_separate(account_api, monkeypatch):
    _, db, _, settings = account_api
    chosen = GenerationSelection(provider="openai", model="gpt-6-astra")
    monkeypatch.setattr(
        generation, "_installed_models", AsyncMock(return_value={settings.ollama_embedding_model})
    )
    await ai_settings.save_key(db, "alice", "openai", "personal-key-1234")
    assert (await generation.resolve_generation(db, "alice", chosen))[0] == chosen
    await ai_settings.delete_key(db, "alice", "openai")
    with pytest.raises(generation.GenerationError, match="ollama pull"):
        await generation.resolve_generation(db, "alice", chosen)
    monkeypatch.setattr(generation, "_installed_models", AsyncMock(return_value=None))
    with pytest.raises(generation.GenerationError, match="source search"):
        await generation.resolve_generation(db, "alice", chosen)


def test_connection_test_uses_personal_key_and_no_ollama(account_api, monkeypatch):
    client, db, _, _ = account_api
    client.patch("/api/v1/settings/ai/providers/openai", json={"apiKey": "personal-key-1234"})
    calls = []

    async def generate(prompt, schema, **kwargs):
        assert "connected" in schema["properties"]
        return {"connected": True}

    def factory(selection, key):
        calls.append((selection, key))
        return SimpleNamespace(generate_json=generate)

    monkeypatch.setattr(settings_routes, "generation_client", factory)
    monkeypatch.setattr(generation, "_installed_models", AsyncMock(return_value=None))
    response = client.post(
        "/api/v1/settings/ai/providers/openai/test", json={"model": "gpt-6-astra"}
    )
    assert response.status_code == 200
    assert calls[0][1] == "personal-key-1234"
    assert next(iter(db.provider_credentials.documents.values()))["tested_models"] == [
        "gpt-6-astra"
    ]
    client.patch("/api/v1/settings/ai/providers/openai", json={"apiKey": "replacement-key-5678"})
    assert not next(iter(db.provider_credentials.documents.values()))["tested_models"]


def test_settings_routes_require_authentication(account_api):
    client, _, _, _ = account_api
    original = app.dependency_overrides.pop(current_user_id)
    try:
        for method, path in [
            ("GET", ""),
            ("PATCH", ""),
            ("PATCH", "/providers/openai"),
            ("DELETE", "/providers/openai"),
            ("POST", "/providers/openai/test"),
        ]:
            response = client.request(method, "/api/v1/settings/ai" + path, json={})
            assert response.status_code == 401
    finally:
        app.dependency_overrides[current_user_id] = original


@pytest.mark.asyncio
@pytest.mark.parametrize("removed_before_execution", [False, True])
async def test_worker_chat_and_3d_resolve_owner_keys_at_execution(
    account_api, monkeypatch, removed_before_execution
):
    from langchain_core.documents import Document

    from src.common.schemas.schemas import Source
    from src.llm import CHAT_SCHEMA, NOTES_SCHEMA, SECTION_SCHEMA, THREE_D_HANDOFF_SCHEMA
    from src.pills.schemas import StudyPill
    from src.repository import _serialize
    from src.services import chat, pipeline

    _, db, _, settings = account_api
    db.pill_three_d = FakeTable()
    chosen = GenerationSelection(provider="openai", model="gpt-6-astra")
    pill = StudyPill(
        id="queued-pill",
        user_id="alice",
        title="Cells",
        subject="Biology",
        generation=chosen,
        selected_materials=["notes", "threeD"],
        sources=[
            Source(
                id="source",
                name="cells.txt",
                kind="document",
                detail="1 KB",
                object_key="alice/cells.txt",
            )
        ],
    )
    await db.pills.insert_one(_serialize(pill))
    await ai_settings.save_key(db, "alice", "openai", "alice-personal-key")
    await ai_settings.save_key(db, "bob", "openai", "bob-personal-key")
    if removed_before_execution:
        await ai_settings.delete_key(db, "alice", "openai")
    evidence = [
        {"sourceId": "source", "locator": "document", "excerpt": "Cells contain a nucleus."}
    ]
    resolved = []

    class FakeGeneration:
        async def generate_json(self, prompt, schema, **kwargs):
            if schema is SECTION_SCHEMA:
                return {
                    "title": "Cells",
                    "summary": "Cell structure",
                    "claims": [],
                    "keyTerms": [],
                    "uncertainties": [],
                }
            if schema is NOTES_SCHEMA:
                return {
                    "summary": "Cell structure",
                    "sections": [
                        {
                            "id": "cells",
                            "title": "Cells",
                            "markdown": "Cells contain a nucleus.",
                            "evidence": evidence,
                        }
                    ],
                }
            if schema is THREE_D_HANDOFF_SCHEMA:
                return {
                    "suitable": True,
                    "title": "Cell",
                    "description": "Nucleus inside cell",
                    "parts": [
                        {"name": "Cell", "appearance": "sphere", "relationship": "outer"},
                        {"name": "Nucleus", "appearance": "sphere", "relationship": "inside cell"},
                    ],
                    "evidence": evidence,
                }
            if "javascript" in schema.get("properties", {}):
                return {
                    "javascript": (
                        "function buildArtifact(THREE, scene) { " "scene.add(new THREE.Group()); }"
                    )
                }
            if schema is CHAT_SCHEMA:
                return {
                    "answer": "Cells contain a nucleus.",
                    "grounded": True,
                    "evidence": evidence,
                }
            raise generation.GenerationError("No visual for this fixture.")

    def factory(selection, key=None):
        resolved.append((selection, key))
        return FakeGeneration()

    retriever = SimpleNamespace(
        index=AsyncMock(),
        retrieve=AsyncMock(
            return_value=[
                Document(
                    page_content="Cells contain a nucleus.",
                    metadata={
                        "source_id": "source",
                        "source_name": "cells.txt",
                        "locator": "document",
                    },
                )
            ]
        ),
    )
    monkeypatch.setattr(generation, "generation_client", factory)
    monkeypatch.setattr(pipeline, "get_database", lambda: db)
    monkeypatch.setattr(
        pipeline,
        "get_storage",
        lambda: SimpleNamespace(
            get_bytes=AsyncMock(return_value=b"Cells contain a nucleus."),
            put_bytes=AsyncMock(),
        ),
    )
    monkeypatch.setattr(pipeline, "StudyPillRetriever", lambda database: retriever)
    monkeypatch.setattr(chat, "StudyPillRetriever", lambda database: retriever)
    await pipeline.process_pill(pill.id)
    stored = db.pills.documents[pill.id]
    expected = default_generation() if removed_before_execution else chosen
    assert stored["status"] == "ready"
    assert stored["generation"] == chosen.model_dump(by_alias=False)
    assert stored["effective_generation"] == expected.model_dump(by_alias=False)
    scene = db.pill_three_d.documents[pill.id]
    assert scene["provider"] == expected.provider and scene["model"] == expected.model
    result = await chat.answer_question(
        db, pill_id=pill.id, user_id="alice", question="What is inside cells?", generation=chosen
    )
    assert result.grounded and result.effective_generation == expected
    assert len(resolved) == 2  # One resolution per worker job and chat request.
    assert all(selection == expected for selection, _ in resolved)
    assert all(
        key == (None if removed_before_execution else "alice-personal-key") for _, key in resolved
    )
    assert "personal-key" not in str(stored) and "personal-key" not in str(scene)
    assert settings.ollama_embedding_model == "nomic-embed-text"


def test_replacing_key_during_connection_test_does_not_mark_replacement_tested(
    account_api, monkeypatch
):
    client, db, _, _ = account_api
    client.patch("/api/v1/settings/ai/providers/openai", json={"apiKey": "original-personal-key"})

    async def generate(*args, **kwargs):
        await ai_settings.save_key(db, "alice", "openai", "replacement-personal-key")
        return {"connected": True}

    monkeypatch.setattr(
        settings_routes, "generation_client", lambda *args: SimpleNamespace(generate_json=generate)
    )
    response = client.post(
        "/api/v1/settings/ai/providers/openai/test", json={"model": "gpt-6-astra"}
    )
    assert response.status_code == 200
    assert not next(iter(db.provider_credentials.documents.values()))["tested_models"]


@pytest.mark.asyncio
async def test_encrypted_payload_is_bound_to_owner(account_api):
    _, db, _, _ = account_api
    await ai_settings.save_key(db, "alice", "openai", "alice-personal-key")
    row = next(iter(db.provider_credentials.documents.values()))
    row["user_id"] = "bob"
    with pytest.raises(ai_settings.CredentialError):
        await ai_settings.load_key(db, "bob", "openai")
