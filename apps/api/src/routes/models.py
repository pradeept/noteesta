from fastapi import APIRouter

from src.generation import available_options
from src.common.schemas.schemas import GenerationOption

router = APIRouter(tags=["models"])


@router.get("/models", response_model=list[GenerationOption])
async def list_generation_models() -> list[GenerationOption]:
    return await available_options()
