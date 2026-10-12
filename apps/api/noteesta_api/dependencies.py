from typing import Annotated

from fastapi import Header, HTTPException, status

from noteesta_api.config import get_settings


async def current_user_id(x_user_id: Annotated[str | None, Header()] = None) -> str:
    settings = get_settings()
    if x_user_id:
        return x_user_id
    if settings.allow_demo_user:
        return settings.demo_user_id
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication is required.",
    )
