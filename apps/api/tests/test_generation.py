import json
from types import SimpleNamespace

import httpx
import pytest

from src import generation
from src.config import Settings
from src.llm import MATERIALS_SCHEMA, NOTES_SCHEMA
from src.repository import _deserialize, _serialize
from src.routes import pills as pill_routes
from src.common.schemas.schemas import AskRequest, ChatAnswer, GenerationSelection, StudyPill


def test_selection_round_trip_and_legacy_default() -> None:
    selected = GenerationSelection(provider="openai", model="gpt-5.4-mini")
    pill = StudyPill(
        id="new", user_id="student", title="New", subject="Science", generation=selected
    )
    assert _deserialize(_serialize(pill)).generation == selected
    legacy = _deserialize(
        {"_id": "old", "user_id": "student", "title": "Old", "subject": "Science"}
    )
    assert legacy.generation == GenerationSelection(
        provider="ollama", model=generation.get_settings().ollama_model
    )


def test_catalog_rejects_unlisted_model_and_closes_structured_schemas() -> None:
    assert not generation.valid_selection(
        GenerationSelection(provider="openai", model="unknown-model")
    )
    for source in (NOTES_SCHEMA, MATERIALS_SCHEMA):
        schema = generation.strict_schema(source)
        assert schema["additionalProperties"] is False
        assert set(schema["required"]) == set(schema["properties"])
        assert source.get("additionalProperties") is None


@pytest.mark.asyncio
async def test_catalog_requires_embeddings_even_with_external_keys(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = Settings(_env_file=None, openai_api_key="test", anthropic_api_key="test")
    monkeypatch.setattr(generation, "get_settings", lambda: settings)

    def respond(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/tags"
        return httpx.Response(200, json={"models": [{"name": settings.ollama_model}]})

    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        generation.httpx,
        "AsyncClient",
        lambda **kwargs: real_client(transport=httpx.MockTransport(respond), **kwargs),
    )
    options = await generation.available_options()
    assert all(not option.available for option in options)
    assert all(settings.ollama_embedding_model in (option.reason or "") for option in options)


@pytest.mark.asyncio
async def test_catalog_accepts_ollama_latest_alias(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = Settings(_env_file=None)
    monkeypatch.setattr(generation, "get_settings", lambda: settings)

    def respond(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "models": [
                    {"name": settings.ollama_model},
                    {"name": f"{settings.ollama_embedding_model}:latest"},
                ]
            },
        )

    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        generation.httpx,
        "AsyncClient",
        lambda **kwargs: real_client(transport=httpx.MockTransport(respond), **kwargs),
    )
    options = await generation.available_options()
    assert options[0].available
    assert not options[1].available  # Gemma 4 26B has not been pulled.


@pytest.mark.asyncio
async def test_openai_adapter_sends_selected_model_and_strict_schema(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        generation, "get_settings", lambda: Settings(_env_file=None, openai_api_key="test")
    )
    seen = {}

    class FakeOpenAI:
        def __init__(self, **kwargs):
            assert kwargs["api_key"] == "test"
            self.responses = self

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def create(self, **kwargs):
            seen.update(kwargs)
            return SimpleNamespace(output_text='{"summary":"Good","sections":[]}')

    monkeypatch.setattr(generation, "AsyncOpenAI", FakeOpenAI)
    result = await generation.OpenAIAdapter("gpt-5.4-mini").generate_json(
        "Write notes", NOTES_SCHEMA, num_predict=7000
    )
    assert result["summary"] == "Good"
    assert seen["model"] == "gpt-5.4-mini"
    assert seen["store"] is False
    assert seen["text"]["format"]["schema"]["additionalProperties"] is False


@pytest.mark.asyncio
async def test_anthropic_adapter_sends_selected_model_and_json_format(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        generation, "get_settings", lambda: Settings(_env_file=None, anthropic_api_key="test")
    )
    seen = {}

    def respond(request: httpx.Request) -> httpx.Response:
        seen.update(json.loads(request.content))
        assert request.headers["x-api-key"] == "test"
        return httpx.Response(
            200,
            json={
                "stop_reason": "end_turn",
                "content": [{"type": "text", "text": '{"summary":"Good","sections":[]}'}],
            },
        )

    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        generation.httpx,
        "AsyncClient",
        lambda **kwargs: real_client(transport=httpx.MockTransport(respond), **kwargs),
    )
    result = await generation.AnthropicAdapter("claude-sonnet-5-5").generate_json(
        "Write notes", NOTES_SCHEMA
    )
    assert result["summary"] == "Good"
    assert seen["model"] == "claude-sonnet-5-5"
    assert seen["thinking"] == {"type": "between_tools"}
    assert seen["output_config"]["format"]["type"] == "json_schema"


@pytest.mark.asyncio
async def test_chat_and_retry_keep_the_pill_generation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    chosen = GenerationSelection(provider="openai", model="gpt-5.4-mini")
    document = _serialize(
        StudyPill(
            id="pill-1",
            user_id="student",
            title="Cells",
            subject="Biology",
            status="ready",
            generation=chosen,
        )
    )

    class FakePills:
        async def find_one(self, query):
            return document if query.get("_id") == document["_id"] else None

        async def update_one(self, _query, change):
            document.update(change["$set"])

    database = SimpleNamespace(pills=FakePills())
    checked = []
    answered = []
    queued = []

    async def check(selection):
        checked.append(selection)

    async def answer(_database, **kwargs):
        answered.append(kwargs["generation"])
        return ChatAnswer(answer="From the source", citations=[], grounded=False)

    monkeypatch.setattr(pill_routes, "require_available_generation", check)
    monkeypatch.setattr(pill_routes, "answer_question", answer)
    monkeypatch.setattr(
        pill_routes.process_pill_task, "delay", lambda pill_id: queued.append(pill_id)
    )
    await pill_routes.chat_with_pill(
        "pill-1", AskRequest(question="What are cells?"), "student", database
    )
    retried = await pill_routes.retry_study_pill("pill-1", "student", database)
    assert checked == [chosen, chosen]
    assert answered == [chosen]
    assert retried.generation == chosen
    assert queued == ["pill-1"]
