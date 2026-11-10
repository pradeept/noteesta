from fastapi import APIRouter, Depends

from src.dependencies.profile import current_user_id
from src.generation import available_options
from src.models.schemas import GenerationOption

router = APIRouter(tags=["models"], dependencies=[Depends(current_user_id)])


@router.get("/models", response_model=list[GenerationOption])
async def list_generation_models() -> list[GenerationOption]:
    return await available_options()
