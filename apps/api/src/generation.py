"""Provider adapters for the structured Study Pill jobs."""

import json
from typing import Any, Protocol

import httpx
from openai import AsyncOpenAI

from src.config import get_settings
from src.llm import OllamaClient
from src.models.schemas import GenerationOption, GenerationSelection


class GenerationClient(Protocol):
    async def generate_json(
        self, prompt: str, schema: dict[str, Any], *, num_predict: int = 4096
    ) -> dict[str, Any]: ...


def model_catalog() -> list[GenerationSelection]:
    """The allowlist shared by the UI and request validation."""
    return [
        GenerationSelection(provider="ollama", model=get_settings().ollama_model),
        GenerationSelection(provider="ollama", model="gemma4:26b"),
        *(
            GenerationSelection(provider="openai", model=model)
            for model in ("gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano")
        ),
        GenerationSelection(provider="anthropic", model="claude-sonnet-5-5"),
    ]


def valid_selection(selection: GenerationSelection) -> bool:
    return selection in model_catalog()


def _installed(model: str, names: set[str]) -> bool:
    return model in names or (":" not in model and f"{model}:latest" in names)


async def _installed_models() -> set[str] | None:
    settings = get_settings()
    try:
        async with httpx.AsyncClient(
            base_url=settings.ollama_base_url, timeout=3, trust_env=False
        ) as client:
            response = await client.get("/api/tags")
            response.raise_for_status()
            return {item["name"] for item in response.json().get("models", [])}
    except (httpx.HTTPError, ValueError, KeyError, TypeError, AttributeError):
        return None


def _option_for(choice: GenerationSelection, installed: set[str] | None) -> GenerationOption:
    settings = get_settings()
    reason = None
    if installed is None:
        reason = "Ollama is required for source search and is unavailable."
    elif not _installed(settings.ollama_embedding_model, installed):
        reason = f"Run ollama pull {settings.ollama_embedding_model} for source search."
    if choice.provider == "ollama":
        if reason is None and not _installed(choice.model, installed):
            reason = f"Run ollama pull {choice.model} first."
        label = f"Ollama · {choice.model}"
    elif choice.provider == "openai":
        if reason is None and not settings.openai_api_key:
            reason = "Set OPENAI_API_KEY on the API and worker."
        label = f"OpenAI · {choice.model}"
    else:
        if reason is None and not settings.anthropic_api_key:
            reason = "Set ANTHROPIC_API_KEY on the API and worker."
        label = "Anthropic · Claude Sonnet 5.5"
    return GenerationOption(
        provider=choice.provider,
        model=choice.model,
        label=label,
        available=reason is None,
        reason=reason,
    )


async def available_options() -> list[GenerationOption]:
    installed = await _installed_models()
    return [_option_for(choice, installed) for choice in model_catalog()]


async def availability_for(choice: GenerationSelection) -> GenerationOption:
    return _option_for(choice, await _installed_models())


def strict_schema(schema: dict[str, Any]) -> dict[str, Any]:
    """Prepare the shared schema for providers requiring closed JSON objects."""
    result = {key: value for key, value in schema.items() if key not in {"minItems", "maxItems"}}
    if "properties" in result:
        result["properties"] = {
            key: strict_schema(value) for key, value in result["properties"].items()
        }
        result["required"] = list(result["properties"])
        result["additionalProperties"] = False
    if "items" in result:
        result["items"] = strict_schema(result["items"])
    return result


def parse_json_response(value: str) -> dict[str, Any]:
    parsed = json.loads(value)
    if not isinstance(parsed, dict):
        raise ValueError("The model did not return a JSON object")
    return parsed


class OllamaAdapter(OllamaClient):
    def __init__(self, model: str) -> None:
        super().__init__(model)


class OpenAIAdapter:
    def __init__(self, model: str) -> None:
        self.model = model

    async def generate_json(
        self, prompt: str, schema: dict[str, Any], *, num_predict: int = 4096
    ) -> dict[str, Any]:
        api_key = get_settings().openai_api_key
        if not api_key:
            raise ValueError("OPENAI_API_KEY is not configured")
        async with AsyncOpenAI(api_key=api_key, timeout=120, max_retries=1) as client:
            response = await client.responses.create(
                model=self.model,
                input=prompt,
                max_output_tokens=num_predict,
                text={
                    "format": {
                        "type": "json_schema",
                        "name": "noteesta_job",
                        "schema": strict_schema(schema),
                        "strict": True,
                    }
                },
                store=False,
            )
        if not response.output_text:
            raise ValueError("OpenAI returned no structured result")
        return parse_json_response(response.output_text)


class AnthropicAdapter:
    def __init__(self, model: str) -> None:
        self.model = model

    async def generate_json(
        self, prompt: str, schema: dict[str, Any], *, num_predict: int = 4096
    ) -> dict[str, Any]:
        api_key = get_settings().anthropic_api_key
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY is not configured")
        async with httpx.AsyncClient(base_url="https://api.anthropic.com", timeout=120) as client:
            response = await client.post(
                "/v1/messages",
                headers={"x-api-key": api_key, "anthropic-version": "2023-06-01"},
                json={
                    "model": self.model,
                    "max_tokens": num_predict,
                    "thinking": {"type": "between_tools"},
                    "messages": [{"role": "user", "content": prompt}],
                    "output_config": {
                        "format": {"type": "json_schema", "schema": strict_schema(schema)}
                    },
                },
            )
            response.raise_for_status()
            payload = response.json()
        if payload.get("stop_reason") == "max_tokens":
            raise ValueError("Anthropic stopped before completing the structured result")
        content = next(
            (part["text"] for part in payload.get("content", []) if part.get("type") == "text"),
            None,
        )
        if not content:
            raise ValueError("Anthropic returned no structured result")
        return parse_json_response(content)


ADAPTERS: dict[str, type[GenerationClient]] = {
    "ollama": OllamaAdapter,
    "openai": OpenAIAdapter,
    "anthropic": AnthropicAdapter,
}


def generation_client(selection: GenerationSelection) -> GenerationClient:
    return ADAPTERS[selection.provider](selection.model)
