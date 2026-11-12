import secrets
from datetime import timedelta
from uuid import uuid4

from fastapi import Response
from pymongo.asynchronous.database import AsyncDatabase

from src.auth.email import send_account_email
from src.auth.schemas import Tokens, User
from src.auth.security import access_expiry, decode_token, digest, encode_token, fail, now
from src.config import get_settings

COOKIE_NAME = "noteesta_refresh"
COOKIE_PATH = "/api/v1/auth"


def public_user(user: dict) -> User:
    return User(
        id=user["_id"],
        email=user["email"],
        display_name=user["display_name"],
        email_verified=user["email_verified"],
        login_methods=[
            method
            for method, present in (
                ("password", user.get("password_hash")),
                ("google", user.get("google_sub")),
            )
            if present
        ],
    )


def set_refresh_cookie(response: Response, token: str, expires) -> None:
    response.set_cookie(
        COOKIE_NAME,
        token,
        max_age=max(0, int((expires - now()).total_seconds())),
        httponly=True,
        secure=get_settings().app_env != "development",
        samesite="lax",
        path=COOKIE_PATH,
    )


def clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        COOKIE_NAME,
        path=COOKIE_PATH,
        httponly=True,
        secure=get_settings().app_env != "development",
        samesite="lax",
    )


def token_response(user: dict, session_id: str) -> Tokens:
    return Tokens(
        access_token=encode_token(user["_id"], session_id, "access", access_expiry()),
        expires_in=get_settings().access_token_minutes * 60,
        user=public_user(user),
    )


async def new_session(database: AsyncDatabase, user: dict, response: Response) -> Tokens:
    session_id = str(uuid4())
    expires = now() + timedelta(days=get_settings().refresh_token_days)
    refresh = encode_token(user["_id"], session_id, "refresh", expires)
    await database.auth_sessions.insert_one(
        {
            "_id": session_id,
            "user_id": user["_id"],
            "refresh_hash": digest(refresh),
            "created_at": now(),
            "expires_at": expires,
            "revoked_at": None,
            "credential_version": user.get("credential_version", 0),
        }
    )
    set_refresh_cookie(response, refresh, expires)
    return token_response(user, session_id)


async def authenticated(
    database: AsyncDatabase, token: str, purpose: str = "access"
) -> tuple[dict, dict]:
    claims = decode_token(token, purpose)
    session = await database.auth_sessions.find_one(
        {
            "_id": claims["sid"],
            "user_id": claims["sub"],
            "revoked_at": None,
            "expires_at": {"$gt": now()},
        }
    )
    user = await database.users.find_one({"_id": claims["sub"], "email_verified": True})
    if (
        not session
        or not user
        or session.get("credential_version", 0) != user.get("credential_version", 0)
    ):
        raise fail("invalid_session", "Your session has expired. Please sign in again.")
    return user, session


async def rotate_session(database: AsyncDatabase, token: str, response: Response) -> Tokens:
    user, session = await authenticated(database, token, "refresh")
    refresh = encode_token(user["_id"], session["_id"], "refresh", session["expires_at"])
    result = await database.auth_sessions.update_one(
        {"_id": session["_id"], "revoked_at": None, "refresh_hash": digest(token)},
        {"$set": {"refresh_hash": digest(refresh)}},
    )
    if result.matched_count != 1:
        await database.auth_sessions.update_one(
            {"_id": session["_id"]}, {"$set": {"revoked_at": now()}}
        )
        raise fail("refresh_reused", "Your session has ended. Please sign in again.")
    set_refresh_cookie(response, refresh, session["expires_at"])
    return token_response(user, session["_id"])


async def send_token(
    database: AsyncDatabase,
    user: dict,
    purpose: str,
    *,
    google_sub: str | None = None,
    binding: str | None = None,
) -> None:
    extra = {}
    if purpose == "google":
        if not google_sub or not binding:
            raise ValueError("Google confirmation requires a subject and browser binding.")
        extra = {
            "email": user["email"],
            "google_sub": google_sub,
            "previous_google_sub": user.get("google_sub"),
            "google_link_verified": user.get("google_link_verified"),
            "binding": digest(binding),
        }
    token = secrets.token_urlsafe(32)
    await database.auth_email_tokens.insert_one(
        {
            "_id": digest(token),
            "user_id": user["_id"],
            "purpose": purpose,
            "credential_version": user.get("credential_version", 0),
            **extra,
            "used_at": None,
            "expires_at": now()
            + (timedelta(hours=24) if purpose == "verify" else timedelta(minutes=30)),
        }
    )
    await send_account_email(user["email"], token, purpose)


async def consume_token(
    database: AsyncDatabase, token: str, purpose: str, *, binding: str | None = None
) -> dict:
    query = {
        "_id": digest(token),
        "purpose": purpose,
        "used_at": None,
        "expires_at": {"$gt": now()},
    }
    if purpose == "google":
        query["binding"] = digest(binding or "")
    entry = await database.auth_email_tokens.find_one_and_update(
        query,
        {"$set": {"used_at": now()}},
    )
    if not entry:
        raise fail("invalid_email_token", "This link has expired or has already been used.", 400)
    return entry
