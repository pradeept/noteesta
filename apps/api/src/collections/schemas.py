from datetime import UTC, datetime
from typing import Literal

from pydantic import Field

from src.common.schemas.schemas import ApiModel

CollectionColor = Literal["moss", "ocean", "terracotta", "plum", "gold", "slate"]


def utc_now() -> datetime:
    return datetime.now(UTC)


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
