from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pymongo.asynchronous.database import AsyncDatabase

from src.auth.security import fail
from src.auth.service import authenticated
from src.config import get_settings
from src.database import database_dependency

LOCAL_USER = {
    "_id": "local-workspace",
    "email": "",
    "display_name": "Local workspace",
    "email_verified": True,
}

bearer = HTTPBearer(auto_error=False)


async def current_user(
    database: Annotated[AsyncDatabase, Depends(database_dependency)],
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> dict:
    if not get_settings().noteesta_auth_enabled:
        return dict(LOCAL_USER)
    if not credentials:
        raise fail("authentication_required", "Please sign in to continue.")
    user, _ = await authenticated(database, credentials.credentials)
    return user
