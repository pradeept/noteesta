from fastapi import APIRouter

from noteesta_api.database import ping_database
from noteesta_api.llm import OllamaClient
from noteesta_api.schemas import HealthResponse
from noteesta_api.storage import get_storage

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    mongo_ok = await ping_database()
    storage_ok = await get_storage().ping()
    ollama_ok = await OllamaClient().ping()
    dependencies = {
        "mongodb": "ready" if mongo_ok else "unavailable",
        "objectStorage": "ready" if storage_ok else "unavailable",
        "ollama": "ready" if ollama_ok else "unavailable",
    }
    status = (
        "ready"
        if all(value == "ready" for value in dependencies.values())
        else "degraded"
    )
    return HealthResponse(status=status, dependencies=dependencies)
