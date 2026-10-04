from datetime import UTC, datetime
from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic.alias_generators import to_camel


def utc_now() -> datetime:
    return datetime.now(UTC)


class ApiModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        serialize_by_alias=True,
        use_enum_values=True,
    )


class MaterialKey(StrEnum):
    notes = "notes"
    flashcards = "flashcards"
    mcqs = "mcqs"
    true_false = "trueFalse"
    roadmap = "roadmap"


class Citation(ApiModel):
    source_id: str
    source_name: str
    locator: str
    excerpt: str


class Source(ApiModel):
    id: str
    name: str
    kind: Literal["audio", "video", "pdf", "document", "image", "youtube"]
    detail: str
    status: Literal["uploaded", "processing", "ready", "failed"] = "uploaded"
    excerpt: str | None = None
    object_key: str | None = Field(default=None, exclude=True)
    url: str | None = Field(default=None, exclude=True)


class NoteSection(ApiModel):
    id: str
    title: str
    markdown: str
    citations: list[Citation] = Field(min_length=1)


class VisualNode(ApiModel):
    id: str
    label: str
    detail: str


class VisualEdge(ApiModel):
    from_: str = Field(alias="from")
    to: str
    label: str


class VisualDatum(ApiModel):
    label: str
    value: float
    unit: str | None = None


class VisualSpec(ApiModel):
    id: str
    title: str
    description: str
    kind: Literal["flow", "bar", "timeline"]
    nodes: list[VisualNode] = Field(default_factory=list)
    edges: list[VisualEdge] = Field(default_factory=list)
    data: list[VisualDatum] = Field(default_factory=list)
    citations: list[Citation] = Field(min_length=1)
    asset_url: str | None = None
    asset_key: str | None = Field(default=None, exclude=True)


class Flashcard(ApiModel):
    id: str
    front: str
    back: str
    citations: list[Citation] = Field(min_length=1)


class Mcq(ApiModel):
    id: str
    question: str
    choices: list[str] = Field(min_length=3, max_length=5)
    correct_index: int = Field(ge=0)
    explanation: str
    citations: list[Citation] = Field(min_length=1)

    @model_validator(mode="after")
    def answer_matches_choices(self) -> "Mcq":
        if self.correct_index >= len(self.choices):
            raise ValueError("correct_index must point to an available choice")
        return self


class TrueFalseQuestion(ApiModel):
    id: str
    statement: str
    answer: bool
    explanation: str
    citations: list[Citation] = Field(min_length=1)


class RoadmapItem(ApiModel):
    id: str
    title: str
    description: str
    section_id: str


class StudyArtifact(ApiModel):
    summary: str
    sections: list[NoteSection]
    visuals: list[VisualSpec] = Field(default_factory=list)
    flashcards: list[Flashcard] = Field(default_factory=list)
    mcqs: list[Mcq] = Field(default_factory=list)
    true_false: list[TrueFalseQuestion] = Field(default_factory=list)
    roadmap: list[RoadmapItem] = Field(default_factory=list)


class StudyPill(ApiModel):
    id: str
    user_id: str = Field(exclude=True)
    title: str
    subject: str
    status: Literal["draft", "queued", "processing", "ready", "failed"] = "draft"
    progress: int = Field(default=0, ge=0, le=100)
    stage: str | None = None
    selected_materials: list[MaterialKey] = Field(default_factory=lambda: [MaterialKey.notes])
    sources: list[Source] = Field(default_factory=list)
    artifact: StudyArtifact | None = None
    updated_at: datetime = Field(default_factory=utc_now)
    error: str | None = None
    settings: dict[str, Any] = Field(default_factory=dict, exclude=True)


class AskRequest(ApiModel):
    question: str = Field(min_length=2, max_length=1000)


class ChatAnswer(ApiModel):
    answer: str
    citations: list[Citation]
    grounded: bool


class HealthResponse(ApiModel):
    status: str
    dependencies: dict[str, str]
