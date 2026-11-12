import json
from types import SimpleNamespace

import httpx
import pytest

from src import generation
from src.common.schemas.schemas import AskRequest, ChatAnswer
from src.config import Settings
from src.llm import MATERIALS_SCHEMA, NOTES_SCHEMA
from src.models.schemas import GenerationSelection
from src.pills import router as pill_routes
from src.pills.schemas import StudyPill
from src.repository import _deserialize, _serialize


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
    settings = Settings(_env_file=None)
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
    options = await generation.available_options({"openai", "anthropic"})
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
    result = await generation.OpenAIAdapter("gpt-5.4-mini", "test").generate_json(
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
    result = await generation.AnthropicAdapter("claude-sonnet-5-5", "test").generate_json(
        "Write notes", NOTES_SCHEMA
    )
    assert result["summary"] == "Good"
    assert seen["model"] == "claude-sonnet-5-5"
    assert "thinking" not in seen  # Let each preset use its supported reasoning default.
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

    async def check(selection, _database, user_id):
        assert user_id == "student"
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
    assert checked == [chosen]
    assert answered == [chosen]
    assert retried.generation == chosen
    assert queued == ["pill-1"]


@pytest.mark.parametrize(
    "provider,model",
    [
        ("openai", "gpt-6-astra"),
        ("openai", "gpt-6.1-sol"),
        ("anthropic", "claude-fable-5-2"),
        ("gemini", "gemini-4-carbon"),
        ("huggingface", "Qwen/Qwen3.8-27B:novita"),
        ("deepseek", "deepseek-v4-pro"),
        ("zai", "glm-5.3"),
    ],
)
def test_flagship_catalog_is_curated_and_requires_explicit_keys(provider, model):
    selected = GenerationSelection(provider=provider, model=model)
    assert generation.valid_selection(selected)
    with pytest.raises(generation.GenerationError, match="personal API key"):
        generation.generation_client(selected)
    assert not generation.valid_selection(GenerationSelection(provider=provider, model="unlisted"))


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "provider,model,path,header",
    [
        ("gemini", "gemini-4-carbon", "/v1beta/interactions", "x-goog-api-key"),
        ("huggingface", "Qwen/Qwen3.8-27B:novita", "/v1/chat/completions", "authorization"),
        ("zai", "glm-5.3", "/api/paas/v4/chat/completions", "authorization"),
        ("deepseek", "deepseek-v4-pro", "/responses", "authorization"),
    ],
)
async def test_new_provider_wire_protocols(monkeypatch, provider, model, path, header):
    seen = {}

    def respond(request):
        assert request.url.path == path
        assert "personal-key" in request.headers[header]
        seen.update(json.loads(request.content))
        if provider == "gemini":
            assert request.headers["api-revision"] == "2026-05-20"
            return httpx.Response(
                200,
                json={
                    "status": "completed",
                    "steps": [
                        {
                            "type": "thought",
                            "content": [{"type": "text", "text": "private reasoning"}],
                        },
                        {
                            "type": "model_output",
                            "content": [
                                {"type": "text", "text": '{"summary":"Good","sections":[]}'}
                            ],
                        },
                    ],
                },
            )
        if provider == "deepseek":
            return httpx.Response(
                200,
                json={
                    "id": "response-1",
                    "object": "response",
                    "created_at": 1,
                    "status": "completed",
                    "model": model,
                    "output": [
                        {
                            "id": "message-1",
                            "type": "message",
                            "role": "assistant",
                            "status": "completed",
                            "content": [
                                {
                                    "type": "output_text",
                                    "text": '{"summary":"Good","sections":[]}',
                                    "annotations": [],
                                }
                            ],
                        }
                    ],
                },
            )
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "finish_reason": "stop",
                        "message": {"content": '{"summary":"Good","sections":[]}'},
                    }
                ]
            },
        )

    real_client = httpx.AsyncClient
    if provider != "deepseek":
        monkeypatch.setattr(
            generation.httpx,
            "AsyncClient",
            lambda **kw: real_client(transport=httpx.MockTransport(respond), **kw),
        )
    if provider == "deepseek":
        real_openai = generation.AsyncOpenAI
        monkeypatch.setattr(
            generation,
            "AsyncOpenAI",
            lambda **kw: real_openai(
                **kw, http_client=real_client(transport=httpx.MockTransport(respond))
            ),
        )
    adapter = generation.generation_client(
        GenerationSelection(provider=provider, model=model), "personal-key"
    )
    assert (await adapter.generate_json("Write notes", NOTES_SCHEMA))["summary"] == "Good"
    assert seen["model"] == model
    if provider == "gemini":
        assert seen["store"] is False
        assert seen["response_format"]["schema"] == NOTES_SCHEMA
    elif provider == "deepseek":
        assert seen["text"]["format"]["type"] == "json_schema"
    elif provider == "zai":
        assert seen["response_format"]["type"] == "json_object"
        assert "schema" in seen["messages"][0]["content"]
    else:
        assert seen["response_format"]["json_schema"]["strict"] is True


@pytest.mark.asyncio
@pytest.mark.parametrize("status", [400, 401, 403, 404, 429, 500])
async def test_provider_errors_are_sanitized_and_never_fall_back(monkeypatch, status):
    real_client = httpx.AsyncClient

    def respond(request):
        return httpx.Response(status, json={"error": "raw-provider-message personal-secret-key"})

    monkeypatch.setattr(
        generation.httpx,
        "AsyncClient",
        lambda **kw: real_client(transport=httpx.MockTransport(respond), **kw),
    )
    with pytest.raises(generation.GenerationError) as error:
        await generation.AnthropicAdapter("claude-opus-5-5", "personal-secret-key").generate_json(
            "write", NOTES_SCHEMA
        )
    assert "personal-secret-key" not in str(error.value)
    assert "raw-provider-message" not in str(error.value)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "payload",
    [
        {"stop_reason": "max_tokens", "content": [{"type": "text", "text": "{}"}]},
        {"stop_reason": "refusal", "content": []},
        {"stop_reason": "end_turn", "content": [{"type": "text", "text": "not json"}]},
        {
            "stop_reason": "end_turn",
            "content": [{"type": "text", "text": '{"summary": 7, "sections": []}'}],
        },
    ],
)
async def test_invalid_structured_results_are_rejected(monkeypatch, payload):
    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        generation.httpx,
        "AsyncClient",
        lambda **kw: real_client(
            transport=httpx.MockTransport(lambda request: httpx.Response(200, json=payload)), **kw
        ),
    )
    with pytest.raises(generation.GenerationError):
        await generation.AnthropicAdapter("claude-opus-5-5", "personal-key").generate_json(
            "write", NOTES_SCHEMA
        )
