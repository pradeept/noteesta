from typing import Literal

from src.common.schemas.schemas import ApiModel


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
