"""Promptfoo provider that sends eval prompts through the backend's LangChain stack."""

import os
from typing import Any

from langchain_ollama import ChatOllama


def call_api(
    prompt: str, options: dict[str, Any], context: dict[str, Any]
) -> dict[str, str]:
    """Run one structured-output eval against the configured local Ollama model."""

    del context
    config = options.get("config", {})
    model = config.get("model") or os.environ["OLLAMA_MODEL"]
    base_url = config.get("base_url") or os.environ["OLLAMA_BASE_URL"]
    response = ChatOllama(
        model=model,
        base_url=base_url,
        format="json",
        temperature=0,
        num_ctx=int(config.get("num_ctx", 32768)),
        num_predict=int(config.get("num_predict", 2000)),
        reasoning=False,
    ).invoke(prompt)
    content = response.content
    if isinstance(content, list):
        content = "".join(
            item["text"] if isinstance(item, dict) else str(item) for item in content
        )
    return {"output": str(content)}
