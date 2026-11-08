from typing import Annotated

from fastapi import Depends

from src.auth.dependencies import current_user


async def current_user_id(user: Annotated[dict, Depends(current_user)]) -> str:
    return user["_id"]
