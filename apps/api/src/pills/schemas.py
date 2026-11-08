from src.common.schemas.schemas import ApiModel, MaterialKey, StudyArtifact
from src.models.schemas import GenerationSelection

from fastapi import Form, UploadFile, File
from datetime import datetime, UTC
from typing import Literal, Any, Annotated
from pydantic import Field, model_validator
from src.config import get_settings


def utc_now():
    return datetime.now(UTC)


def default_generation() -> GenerationSelection:
    return GenerationSelection(provider="ollama", model=get_settings().ollama_model)


class Source(ApiModel):
    id: str
    name: str
    kind: Literal["audio", "video", "pdf", "document", "image", "youtube"]
    detail: str
    status: Literal["uploaded", "processing", "ready", "failed"] = "uploaded"
    excerpt: str | None = None
    object_key: str | None = Field(default=None, exclude=True)
    url: str | None = Field(default=None, exclude=True)
    original_available: bool = True

    @model_validator(mode="before")
    @classmethod
    def youtube_source_has_no_stored_file(cls, values: Any) -> Any:
        if (
            isinstance(values, dict)
            and values.get("kind") == "youtube"
            and "original_available" not in values
        ):
            return {**values, "original_available": False}
        return values


class StudyPill(ApiModel):
    id: str
    user_id: str = Field(exclude=True)
    title: str
    subject: str
    description: str | None = None
    tags: list[str] = Field(default_factory=list)
    collection_id: str | None = None
    status: Literal["draft", "queued", "processing", "ready", "failed"] = "draft"
    progress: int = Field(default=0, ge=0, le=100)
    stage: str | None = None
    selected_materials: list[MaterialKey] = Field(default_factory=lambda: [MaterialKey.notes])
    generation: GenerationSelection = Field(default_factory=default_generation)
    sources: list[Source] = Field(default_factory=list)
    artifact: StudyArtifact | None = None
    updated_at: datetime = Field(default_factory=utc_now)
    processing_duration_seconds: int | None = None
    error: str | None = None
    settings: dict[str, Any] = Field(default_factory=dict, exclude=True)


class StudyPillCreate(ApiModel):
    title: Annotated[str, Form(min_length=1, max_length=100)]
    subject: Annotated[str, Form(min_length=1, max_length=60)]
    selected_materials: Annotated[str, Form()] = '["notes"]'
    detail_level: Annotated[str, Form()] = "balanced"
    learner_level: Annotated[str, Form()] = "intermediate"
    target_exam_date: Annotated[str, Form()] = ""
    study_hours_per_day: Annotated[str, Form()] = ""
    youtube_url: Annotated[str, Form()] = ""
    generation_provider: Annotated[str, Form()] = "ollama"
    generation_model: Annotated[str, Form()] = ""
    files: Annotated[list[UploadFile] | None, File()] = None


class StudyPillUpdate(ApiModel):
    title: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=500)
    tags: list[str] | None = Field(default=None, max_length=20)
    collection_id: str | None = None
