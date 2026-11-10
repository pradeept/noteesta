from functools import lru_cache
from pathlib import Path
from typing import Annotated

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[1] / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: str = "development"
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    api_log_level: str = "INFO"
    cors_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:3000"]
    )
    # A generated process-local key is allowed only for local development.
    jwt_secret: str = ""
    jwt_issuer: str = "noteesta"
    jwt_audience: str = "noteesta-api"
    access_token_minutes: int = Field(default=15, ge=1, le=60)
    refresh_token_days: int = Field(default=30, ge=1, le=90)
    web_url: str = "http://localhost:3000"
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:8000/api/v1/auth/google/callback"
    email_adapter: str = "local"
    resend_api_key: str = ""
    email_from: str = "Noteesta <accounts@noteesta.com>"
    local_email_directory: str = ".local/emails"
    max_upload_bytes: int = 100 * 1024 * 1024

    mongodb_uri: str = "mongodb://localhost:27017"
    mongodb_database: str = "noteesta"
    mongodb_vector_index: str = "vector_index"

    redis_url: str = "redis://localhost:6379/0"
    celery_task_always_eager: bool = False

    s3_endpoint_url: str = "http://localhost:8333"
    s3_access_key_id: str = "noteesta"
    s3_secret_access_key: str = "change-me"
    s3_bucket: str = "noteesta"
    s3_region: str = "us-east-1"
    s3_use_ssl: bool = False

    ollama_base_url: str = "http://127.0.0.1:11434"
    ollama_model: str = "qwen3-vl:8b-instruct"
    ollama_embedding_model: str = "nomic-embed-text"
    ollama_timeout_seconds: float = 300
    ollama_num_ctx: int = 32768

    openai_api_key: str | None = None
    openai_3d_model: str = "gpt-5.4"
    anthropic_api_key: str | None = None

    whisper_model: str = "small"
    whisper_device: str = "auto"
    chunk_size: int = 1800
    chunk_overlap: int = 180
    video_frame_interval_seconds: int = 30

    @field_validator("cors_origins", mode="before")
    @classmethod
    def split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
