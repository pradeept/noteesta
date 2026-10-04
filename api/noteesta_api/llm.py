import json
from typing import Any

import httpx
from langchain_core.messages import HumanMessage
from langchain_ollama import ChatOllama, OllamaEmbeddings

from noteesta_api.config import get_settings


class OllamaClient:
    """Provide the structured LLM and embedding operations used by Study Pill jobs."""

    def __init__(self) -> None:
        self.settings = get_settings()

    async def generate_json(
        self,
        prompt: str,
        schema: dict[str, Any],
        *,
        num_predict: int = 4096,
    ) -> dict[str, Any]:
        model = ChatOllama(
            model=self.settings.ollama_model,
            base_url=self.settings.ollama_base_url,
            temperature=0,
            num_ctx=self.settings.ollama_num_ctx,
            num_predict=num_predict,
            reasoning=False,
        )
        structured_model = model.with_structured_output(schema, method="json_schema")
        result = await structured_model.ainvoke([HumanMessage(content=prompt)])
        if isinstance(result, dict):
            return result
        if hasattr(result, "model_dump"):
            return result.model_dump()
        if isinstance(result, str):
            try:
                return json.loads(result)
            except json.JSONDecodeError as error:
                raise ValueError("Ollama returned invalid JSON") from error
        raise ValueError("Ollama returned an unsupported structured response")

    async def embed(self, inputs: list[str]) -> list[list[float]]:
        """Embed source documents with the configured Ollama embedding model."""

        embeddings = OllamaEmbeddings(
            model=self.settings.ollama_embedding_model,
            base_url=self.settings.ollama_base_url,
        )
        return await embeddings.aembed_documents(inputs)

    async def embed_query(self, query: str) -> list[float]:
        """Embed a retrieval query using LangChain's query embedding operation."""

        embeddings = OllamaEmbeddings(
            model=self.settings.ollama_embedding_model,
            base_url=self.settings.ollama_base_url,
        )
        return await embeddings.aembed_query(query)

    async def ping(self) -> bool:
        try:
            async with httpx.AsyncClient(
                base_url=self.settings.ollama_base_url,
                timeout=3,
            ) as client:
                response = await client.get("/api/tags")
                return response.is_success
        except httpx.HTTPError:
            return False


SECTION_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "summary": {"type": "string"},
        "claims": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "text": {"type": "string"},
                    "locator": {"type": "string"},
                    "excerpt": {"type": "string"},
                },
                "required": ["text", "locator", "excerpt"],
            },
        },
        "keyTerms": {"type": "array", "items": {"type": "object"}},
        "uncertainties": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["title", "summary", "claims", "keyTerms", "uncertainties"],
}

NOTES_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "sections": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "title": {"type": "string"},
                    "markdown": {"type": "string"},
                    "evidence": {"type": "array", "items": {"type": "object"}},
                },
                "required": ["id", "title", "markdown", "evidence"],
            },
        },
    },
    "required": ["summary", "sections"],
}

MATERIALS_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "flashcards": {"type": "array", "items": {"type": "object"}},
        "mcqs": {"type": "array", "items": {"type": "object"}},
        "trueFalse": {"type": "array", "items": {"type": "object"}},
        "roadmap": {"type": "array", "items": {"type": "object"}},
    },
}

VISUAL_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "description": {"type": "string"},
        "kind": {"type": "string", "enum": ["flow", "bar", "timeline"]},
        "nodes": {"type": "array", "items": {"type": "object"}},
        "edges": {"type": "array", "items": {"type": "object"}},
        "data": {"type": "array", "items": {"type": "object"}},
        "evidence": {"type": "array", "items": {"type": "object"}},
    },
    "required": ["title", "description", "kind", "nodes", "edges", "data", "evidence"],
}

CHAT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "answer": {"type": "string"},
        "grounded": {"type": "boolean"},
        "evidence": {"type": "array", "items": {"type": "object"}},
    },
    "required": ["answer", "grounded", "evidence"],
}
