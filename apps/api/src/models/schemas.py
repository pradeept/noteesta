from typing import Literal
from pydantic import Field

from src.common.schemas.schemas import ApiModel
from src.config import get_settings


class GenerationSelection(ApiModel):
    provider: Literal["ollama", "openai", "anthropic"]
    model: str = Field(min_length=1)


def default_generation() -> GenerationSelection:
    return GenerationSelection(provider="ollama", model=get_settings().ollama_model)


class GenerationOption(GenerationSelection):
    label: str
    available: bool
    reason: str | None = None
