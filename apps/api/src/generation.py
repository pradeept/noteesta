"""Structured generation adapters and the shared, curated model registry."""

import json
from typing import Any, Protocol

import httpx
import jsonschema
from openai import APIConnectionError, APIStatusError, AsyncOpenAI

from src.ai_settings import load_key
from src.config import get_settings
from src.llm import OllamaClient
from src.models.schemas import GenerationOption, GenerationSelection, default_generation

PROVIDER_LABELS = {
    "ollama": "Ollama",
    "openai": "OpenAI",
    "anthropic": "Anthropic",
    "gemini": "Google Gemini",
    "huggingface": "Hugging Face",
    "deepseek": "DeepSeek",
    "zai": "Z.ai / GLM",
}
# Explicit IDs, never arbitrary URLs or user-controlled model IDs. Published model
# capability is distinct from a live Noteesta evaluation; see evals/README.md.
PRESETS = {
    "openai": [
        ("gpt-6-astra", "GPT-6 Astra", "flagship"),
        ("gpt-6.1-sol", "GPT-6.1 Sol", "balanced"),
        ("gpt-6-luna", "GPT-6 Luna", "fast"),
        ("gpt-5.4", "GPT-5.4", "previous"),
        ("gpt-5.4-mini", "GPT-5.4 mini", "previous"),
        ("gpt-5.4-nano", "GPT-5.4 nano", "previous"),
    ],
    "anthropic": [
        ("claude-fable-5-2", "Claude Fable 5.2", "flagship"),
        ("claude-opus-5-5", "Claude Opus 5.5", "flagship"),
        ("claude-sonnet-5-5", "Claude Sonnet 5.5", "balanced"),
        ("claude-haiku-5-5", "Claude Haiku 5.5", "fast"),
    ],
    "gemini": [
        ("gemini-4-carbon", "Gemini 4 Carbon", "flagship"),
        ("gemini-4-argon", "Gemini 4 Argon", "balanced"),
        ("gemini-3.8-flash", "Gemini 3.8 Flash", "fast"),
    ],
    "huggingface": [("Qwen/Qwen3.8-27B:novita", "Qwen3.8 27B · Novita", "flagship")],
    "deepseek": [
        ("deepseek-v4-pro", "DeepSeek V4 Pro", "flagship"),
        ("deepseek-flash", "DeepSeek V4.1 Flash", "fast"),
    ],
    "zai": [("glm-5.3", "GLM-5.3", "flagship")],
}


class GenerationError(ValueError):
    """Safe to expose to a user; never contains provider response bodies or keys."""


class GenerationClient(Protocol):
    async def generate_json(
        self, prompt: str, schema: dict[str, Any], *, num_predict: int = 4096
    ) -> dict[str, Any]: ...


def model_catalog() -> list[GenerationSelection]:
    local = list(dict.fromkeys([get_settings().ollama_model, "gemma4:26b"]))
    return [GenerationSelection(provider="ollama", model=model) for model in local] + [
        GenerationSelection(provider=provider, model=model)
        for provider, presets in PRESETS.items()
        for model, _, _ in presets
    ]


def valid_selection(selection: GenerationSelection) -> bool:
    return selection in model_catalog()


def _installed(model: str, names: set[str]) -> bool:
    return model in names or (":" not in model and f"{model}:latest" in names)


async def _installed_models() -> set[str] | None:
    try:
        async with httpx.AsyncClient(
            base_url=get_settings().ollama_base_url, timeout=3, trust_env=False
        ) as client:
            response = await client.get("/api/tags")
            response.raise_for_status()
            return {item["name"] for item in response.json().get("models", [])}
    except (httpx.HTTPError, ValueError, KeyError, TypeError, AttributeError):
        return None


def _option_for(
    choice: GenerationSelection,
    installed: set[str] | None,
    configured: set[str] | None = None,
) -> GenerationOption:
    settings = get_settings()
    reason = None
    if installed is None:
        reason = "Ollama is required for source search and is unavailable."
    elif not _installed(settings.ollama_embedding_model, installed):
        reason = f"Run ollama pull {settings.ollama_embedding_model} for source search."
    label, tier = choice.model, "local"
    if choice.provider == "ollama":
        if reason is None and not _installed(choice.model, installed):
            reason = f"Run ollama pull {choice.model} first."
    else:
        label, tier = next(
            (label, tier)
            for model, label, tier in PRESETS[choice.provider]
            if model == choice.model
        )
        if reason is None and choice.provider not in (configured or set()):
            reason = f"Add your {PROVIDER_LABELS[choice.provider]} key in Settings."
    return GenerationOption(
        **choice.model_dump(),
        label=f"{PROVIDER_LABELS[choice.provider]} · {label}",
        tier=tier,
        available=reason is None,
        reason=reason,
    )


async def available_options(configured: set[str] | None = None) -> list[GenerationOption]:
    installed = await _installed_models()
    return [_option_for(choice, installed, configured) for choice in model_catalog()]


async def availability_for(
    choice: GenerationSelection,
    configured: set[str] | None = None,
) -> GenerationOption:
    return _option_for(choice, await _installed_models(), configured)


async def resolve_generation(database, user_id: str, selection: GenerationSelection):
    """Resolve once per operation; a missing key alone permits local fallback."""
    if not valid_selection(selection):
        raise GenerationError("This model is unsupported. Choose a preset in Settings.")
    key = (
        None
        if selection.provider == "ollama"
        else await load_key(database, user_id, selection.provider)
    )
    effective = selection if selection.provider == "ollama" or key else default_generation()
    option = await availability_for(effective, {effective.provider} if key else set())
    if not option.available:
        raise GenerationError(option.reason or "The selected model is unavailable.")
    return effective, generation_client(effective, key)


def strict_schema(schema: dict[str, Any]) -> dict[str, Any]:
    """Close JSON objects without mutating the original validation schema."""
    result = {key: value for key, value in schema.items() if key not in {"minItems", "maxItems"}}
    for keyword in ("properties", "$defs", "definitions"):
        if keyword in result:
            result[keyword] = {key: strict_schema(value) for key, value in result[keyword].items()}
    if "properties" in result:
        result["required"] = list(result["properties"])
        result["additionalProperties"] = False
    if isinstance(result.get("items"), dict):
        result["items"] = strict_schema(result["items"])
    for keyword in ("anyOf", "allOf", "oneOf"):
        if keyword in result:
            result[keyword] = [strict_schema(value) for value in result[keyword]]
    return result


def parse_json_response(value: str) -> dict[str, Any]:
    parsed = json.loads(value)
    if not isinstance(parsed, dict):
        raise GenerationError("The model did not return a JSON object.")
    return parsed


def _http_error(status: int) -> GenerationError:
    if status in {401, 403}:
        message = "The provider rejected your key or model access. Check Settings."
    elif status in {402, 429}:
        message = (
            "The provider's quota, billing, or rate limit prevented this request. Try again later."
        )
    elif status == 404:
        message = "This model is unavailable for your provider account. Choose another preset."
    elif status >= 500:
        message = "The provider is temporarily unavailable. Try again later."
    else:
        message = "The provider rejected this request. Check model access and try another preset."
    return GenerationError(message)


class StructuredAdapter:
    async def generate_json(
        self, prompt: str, schema: dict[str, Any], *, num_predict: int = 4096
    ) -> dict[str, Any]:
        try:
            result = await self._generate_json(prompt, schema, num_predict=num_predict)
            jsonschema.validate(result, schema)
            return result
        except GenerationError:
            raise
        except (httpx.HTTPStatusError, APIStatusError) as error:
            status = error.response.status_code
            raise _http_error(status) from None
        except (httpx.HTTPError, APIConnectionError):
            raise GenerationError("Could not reach the model provider. Try again later.") from None
        except (
            ValueError,
            TypeError,
            KeyError,
            IndexError,
            AttributeError,
            jsonschema.ValidationError,
        ):
            raise GenerationError(
                "The model returned an incomplete or invalid structured result."
            ) from None

    async def _generate_json(self, prompt, schema, *, num_predict):
        raise NotImplementedError


class OllamaAdapter(StructuredAdapter):
    def __init__(self, model: str) -> None:
        self.client = OllamaClient(model)

    async def _generate_json(self, prompt, schema, *, num_predict):
        return await self.client.generate_json(prompt, schema, num_predict=num_predict)


class KeyAdapter(StructuredAdapter):
    def __init__(self, model: str, api_key: str) -> None:
        self.model = model
        self._api_key = api_key

    @staticmethod
    def output_budget(num_predict: int) -> int:
        # Reasoning models count hidden reasoning inside their completion budget.
        return max(16384, num_predict + 8192)


class OpenAIAdapter(KeyAdapter):
    base_url = "https://api.openai.com/v1"
    strict = True

    async def _generate_json(self, prompt, schema, *, num_predict):
        format_ = {"type": "json_schema", "name": "noteesta_job", "schema": strict_schema(schema)}
        if self.strict:
            format_["strict"] = True
        async with AsyncOpenAI(
            api_key=self._api_key, base_url=self.base_url, timeout=180, max_retries=1
        ) as client:
            response = await client.responses.create(
                model=self.model,
                input=prompt,
                max_output_tokens=self.output_budget(num_predict),
                text={"format": format_},
                store=False,
            )
        if getattr(response, "status", "completed") != "completed" or not response.output_text:
            raise GenerationError("The model refused or stopped before completing the result.")
        return parse_json_response(response.output_text)


class DeepSeekAdapter(OpenAIAdapter):
    base_url = "https://api.deepseek.com"
    strict = False


class AnthropicAdapter(KeyAdapter):
    async def _generate_json(self, prompt, schema, *, num_predict):
        async with httpx.AsyncClient(base_url="https://api.anthropic.com", timeout=180) as client:
            response = await client.post(
                "/v1/messages",
                headers={"x-api-key": self._api_key, "anthropic-version": "2023-06-01"},
                json={
                    "model": self.model,
                    "max_tokens": self.output_budget(num_predict),
                    "messages": [{"role": "user", "content": prompt}],
                    "output_config": {
                        "format": {"type": "json_schema", "schema": strict_schema(schema)}
                    },
                },
            )
            response.raise_for_status()
            payload = response.json()
        if payload.get("stop_reason") != "end_turn":
            raise GenerationError("The model refused or stopped before completing the result.")
        content = "".join(
            part["text"] for part in payload.get("content", []) if part.get("type") == "text"
        )
        return parse_json_response(content)


class GeminiAdapter(KeyAdapter):
    async def _generate_json(self, prompt, schema, *, num_predict):
        async with httpx.AsyncClient(
            base_url="https://generativelanguage.googleapis.com", timeout=180
        ) as client:
            response = await client.post(
                "/v1beta/interactions",
                headers={
                    "x-goog-api-key": self._api_key,
                    "Api-Revision": "2026-05-20",
                },
                json={
                    "model": self.model,
                    "input": prompt,
                    "store": False,
                    "generation_config": {"max_output_tokens": self.output_budget(num_predict)},
                    "response_format": {
                        "type": "text",
                        "mime_type": "application/json",
                        "schema": schema,
                    },
                },
            )
            response.raise_for_status()
            payload = response.json()
        if payload.get("status") != "completed":
            raise GenerationError("The model refused or stopped before completing the result.")
        content = "".join(
            part["text"]
            for step in payload.get("steps", [])
            if step.get("type") == "model_output"
            for part in step.get("content", [])
            if part.get("type") == "text"
        )
        return parse_json_response(content)


class CompatibleAdapter(KeyAdapter):
    base_url = "https://router.huggingface.co/v1"
    json_mode = False

    async def _generate_json(self, prompt, schema, *, num_predict):
        format_ = (
            {"type": "json_object"}
            if self.json_mode
            else {
                "type": "json_schema",
                "json_schema": {
                    "name": "noteesta_job",
                    "schema": strict_schema(schema),
                    "strict": True,
                },
            }
        )
        body = {
            "model": self.model,
            "max_tokens": self.output_budget(num_predict),
            "messages": [
                {
                    "role": "system",
                    "content": "Return only a JSON object matching this schema: "
                    + json.dumps(schema),
                },
                {"role": "user", "content": prompt},
            ],
            "response_format": format_,
        }
        async with httpx.AsyncClient(base_url=self.base_url, timeout=180) as client:
            response = await client.post(
                "chat/completions", headers={"Authorization": f"Bearer {self._api_key}"}, json=body
            )
            response.raise_for_status()
            payload = response.json()
        choice = payload["choices"][0]
        if choice.get("finish_reason") != "stop" or choice["message"].get("refusal"):
            raise GenerationError("The model refused or stopped before completing the result.")
        return parse_json_response(choice["message"]["content"])


class ZaiAdapter(CompatibleAdapter):
    base_url = "https://api.z.ai/api/paas/v4/"
    json_mode = True


ADAPTERS = {
    "openai": OpenAIAdapter,
    "anthropic": AnthropicAdapter,
    "gemini": GeminiAdapter,
    "huggingface": CompatibleAdapter,
    "deepseek": DeepSeekAdapter,
    "zai": ZaiAdapter,
}


def generation_client(
    selection: GenerationSelection, api_key: str | None = None
) -> GenerationClient:
    if not valid_selection(selection):
        raise GenerationError("Choose a supported model preset.")
    if selection.provider == "ollama":
        return OllamaAdapter(selection.model)
    if not api_key:
        raise GenerationError("A personal API key is required for this provider.")
    return ADAPTERS[selection.provider](selection.model, api_key)
