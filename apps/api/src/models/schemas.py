from src.common.schemas.schemas import GenerationSelection as GenerationSelection
from src.config import get_settings


def default_generation() -> GenerationSelection:
    return GenerationSelection(provider="ollama", model=get_settings().ollama_model)


class GenerationOption(GenerationSelection):
    label: str
    available: bool
    reason: str | None = None
    tier: str = "balanced"
