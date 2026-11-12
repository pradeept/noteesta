from datetime import datetime

from pydantic import Field, SecretStr

from src.common.schemas.schemas import ApiModel, HostedProvider
from src.models.schemas import GenerationOption, GenerationSelection


class ProviderStatus(ApiModel):
    provider: HostedProvider
    label: str
    configured: bool
    suffix: str | None = None
    updated_at: datetime | None = None
    tested_models: list[str] = Field(default_factory=list)


class AISettings(ApiModel):
    default_generation: GenerationSelection
    keys_enabled: bool
    providers: list[ProviderStatus]
    models: list[GenerationOption]


class AISettingsUpdate(ApiModel):
    default_generation: GenerationSelection


class ProviderKeyUpdate(ApiModel):
    # Validate manually at this credential boundary to prevent FastAPI's 422
    # input echo from exposing rejected plaintext secrets.
    api_key: SecretStr


class ConnectionTest(ApiModel):
    model: str = Field(min_length=1, max_length=200)
