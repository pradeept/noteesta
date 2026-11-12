"""Promptfoo provider using the exact structured adapters used by the application."""

import asyncio
import json
import os
from typing import Any

from src.generation import GenerationError, generation_client
from src.llm import CHAT_SCHEMA, MATERIALS_SCHEMA, NOTES_SCHEMA, SECTION_SCHEMA, VISUAL_SCHEMA
from src.models.schemas import GenerationSelection

SCHEMAS = {
    "sections": SECTION_SCHEMA,
    "notes": NOTES_SCHEMA,
    "materials": MATERIALS_SCHEMA,
    "visuals": VISUAL_SCHEMA,
    "chat": CHAT_SCHEMA,
}
# Dedicated, explicitly supplied evaluator credentials. Never query account keys
# or fall back to the server's historical generation credentials.
KEY_ENVS = {
    "openai": "EVAL_OPENAI_API_KEY",
    "anthropic": "EVAL_ANTHROPIC_API_KEY",
    "gemini": "EVAL_GEMINI_API_KEY",
    "huggingface": "EVAL_HF_TOKEN",
    "deepseek": "EVAL_DEEPSEEK_API_KEY",
    "zai": "EVAL_ZAI_API_KEY",
}


def call_api(prompt: str, options: dict[str, Any], context: dict[str, Any]) -> dict[str, str]:
    """Evaluate a preset with an explicit credential, without missing-key fallback."""
    del context
    config = options.get("config", {})
    provider = config.get("provider") or os.environ.get("EVAL_PROVIDER", "ollama")
    model = config.get("model") or os.environ.get("EVAL_MODEL") or os.environ["OLLAMA_MODEL"]
    job = config.get("job", "sections")
    if job not in SCHEMAS:
        return {"error": "Choose a supported evaluation job."}
    key = os.environ.get(KEY_ENVS.get(provider, ""))
    if provider != "ollama" and not key:
        return {
            "error": f'Set {KEY_ENVS.get(provider, "a supported provider")} to run this evaluation.'
        }
    try:
        client = generation_client(GenerationSelection(provider=provider, model=model), key)
        result = asyncio.run(
            client.generate_json(
                prompt,
                SCHEMAS[job],
                num_predict=int(config.get("num_predict", 4096)),
            )
        )
        return {"output": json.dumps(result, ensure_ascii=False)}
    except (GenerationError, ValueError):
        return {
            "error": "Evaluation failed. Check model access, quota and structured-output support."
        }
