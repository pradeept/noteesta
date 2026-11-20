import asyncio
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import Field
from redis.exceptions import RedisError

from src.auth.security import digest, rate_store
from src.common.schemas.schemas import ApiModel
from src.config import get_settings
from src.dependencies.profile import current_user_id
from src.services.web_sources import WebImportError, discover_page, fetch_page, website_url

router = APIRouter(prefix="/sources/web", tags=["website-sources"])


class DiscoverRequest(ApiModel):
    url: str = Field(min_length=1, max_length=4096)


class PageCandidate(ApiModel):
    url: str
    title: str


class DiscoverResponse(PageCandidate):
    links: list[PageCandidate]
    capped: bool


async def discovery_rate_limit(user_id: str) -> None:
    script = """
    local count = redis.call('INCR', KEYS[1])
    if count == 1 then redis.call('EXPIRE', KEYS[1], 60) end
    return count
    """
    try:
        count = await rate_store().eval(script, 1, f"web:discovery:{digest(user_id)}")
    except RedisError as error:
        raise HTTPException(503, "Website discovery is temporarily unavailable.") from error
    if count > get_settings().web_discovery_rate_per_minute:
        raise HTTPException(
            429, "Too many page lookups. Try again in a minute.", headers={"Retry-After": "60"}
        )


@router.post("/discover", response_model=DiscoverResponse)
async def discover_website(
    body: DiscoverRequest,
    user_id: Annotated[str, Depends(current_user_id)],
) -> DiscoverResponse:
    try:
        url = website_url(body.url)
    except WebImportError as error:
        raise HTTPException(422, str(error)) from error
    await discovery_rate_limit(user_id)
    try:
        page = await fetch_page(url)
        result = await asyncio.to_thread(discover_page, page)
    except WebImportError as error:
        raise HTTPException(422, str(error)) from error
    return DiscoverResponse(**result)
