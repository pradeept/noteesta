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
    description: str | None = None
    tags: list[str] = Field(default_factory=list)
    collection_id: str | None = None
    status: Literal["draft", "queued", "processing", "ready", "failed"] = "draft"
    progress: int = Field(default=0, ge=0, le=100)
    stage: str | None = None
    selected_materials: list[MaterialKey] = Field(default_factory=lambda: [MaterialKey.notes])
    sources: list[Source] = Field(default_factory=list)
    artifact: StudyArtifact | None = None
    updated_at: datetime = Field(default_factory=utc_now)
    processing_duration_seconds: int | None = None
    error: str | None = None
    settings: dict[str, Any] = Field(default_factory=dict, exclude=True)


CollectionColor = Literal["moss", "ocean", "terracotta", "plum", "gold", "slate"]


class Collection(ApiModel):
    id: str
    user_id: str = Field(exclude=True)
    name: str = Field(min_length=1, max_length=60)
    color: CollectionColor = "moss"
    created_at: datetime = Field(default_factory=utc_now)


class CollectionCreate(ApiModel):
    name: str = Field(min_length=1, max_length=60)
    color: CollectionColor = "moss"


class CollectionUpdate(ApiModel):
    name: str | None = Field(default=None, min_length=1, max_length=60)
    color: CollectionColor | None = None


class StudyPillUpdate(ApiModel):
    title: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=500)
    tags: list[str] | None = Field(default=None, max_length=20)
    collection_id: str | None = None


class BulkPillCollectionUpdate(ApiModel):
    pill_ids: list[str] = Field(min_length=1, max_length=100)
    collection_id: str | None = None


class LibraryPillReference(ApiModel):
    id: str
    title: str


class LibraryEntry(ApiModel):
    source_id: str
    name: str
    kind: Literal["audio", "video", "pdf", "document", "image", "youtube"]
    detail: str
    original_available: bool
    youtube_url: str | None = None
    pills: list[LibraryPillReference]


class AskRequest(ApiModel):
    question: str = Field(min_length=2, max_length=1000)


class ChatAnswer(ApiModel):
    answer: str
    citations: list[Citation]
    grounded: bool


class HealthResponse(ApiModel):
    status: str
    dependencies: dict[str, str]
