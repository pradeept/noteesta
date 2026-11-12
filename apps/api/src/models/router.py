from typing import Annotated

from fastapi import APIRouter, Depends
from pymongo.asynchronous.database import AsyncDatabase

from src.ai_settings import credential_metadata, keys_enabled
from src.database import database_dependency
from src.dependencies.profile import current_user_id
from src.generation import available_options
from src.models.schemas import GenerationOption

router = APIRouter(tags=["models"], dependencies=[Depends(current_user_id)])


@router.get("/models", response_model=list[GenerationOption])
async def list_generation_models(
    user_id: Annotated[str, Depends(current_user_id)],
    database: Annotated[AsyncDatabase, Depends(database_dependency)],
) -> list[GenerationOption]:
    configured = set(await credential_metadata(database, user_id)) if keys_enabled() else set()
    return await available_options(configured)
