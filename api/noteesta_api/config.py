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
    allow_demo_user: bool = True
    demo_user_id: str = "demo-user"
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
