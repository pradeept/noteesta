from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import DuplicateKeyError

from src.auth.dependencies import current_user
from src.auth.google import finish_google, start_google
from src.auth.schemas import (
    EmailInput,
    LoginInput,
    RegisterInput,
    ResetInput,
    TokenInput,
    Tokens,
    User,
)
from src.auth.security import (
    browser_request,
    decode_token,
    fail,
    hash_password,
    now,
    rate_limit,
    verify_password,
)
from src.auth.service import (
    COOKIE_NAME,
    clear_refresh_cookie,
    consume_token,
    new_session,
    public_user,
    rotate_session,
    send_token,
)
from src.database import database_dependency

router = APIRouter(prefix="/auth", tags=["auth"])
Database = Annotated[AsyncDatabase, Depends(database_dependency)]
Browser = Depends(browser_request)
GENERIC = {"message": "If this address is eligible, an email will arrive shortly."}


@router.post("/register", status_code=202, dependencies=[Browser])
async def register(body: RegisterInput, request: Request, database: Database):
    await rate_limit(request, "register", body.email)
    hashed = await hash_password(body.password)
    user = {
        "_id": str(uuid4()),
        "email": body.email,
        "display_name": body.display_name.strip() or body.email,
        "email_verified": False,
        "password_hash": hashed,
        "created_at": now(),
        "credential_version": 0,
    }
    try:
        await database.users.insert_one(user)
    except DuplicateKeyError:
        existing = await database.users.find_one({"email": body.email, "email_verified": False})
        if existing:
            await send_token(database, existing, "verify")
        return GENERIC
    await send_token(database, user, "verify")
    return GENERIC


@router.post("/login", response_model=Tokens, dependencies=[Browser])
async def login(body: LoginInput, request: Request, response: Response, database: Database):
    await rate_limit(request, "login", body.email)
    user = await database.users.find_one({"email": body.email})
    if not await verify_password(body.password, user.get("password_hash") if user else None):
        raise fail("invalid_credentials", "The email or password is incorrect.")
    if not user["email_verified"]:
        raise fail("email_not_verified", "Verify your email before signing in.", 403)
    return await new_session(database, user, response)


@router.post("/resend-verification", status_code=202, dependencies=[Browser])
async def resend_verification(body: EmailInput, request: Request, database: Database):
    await rate_limit(request, "resend", body.email)
    user = await database.users.find_one({"email": body.email, "email_verified": False})
    if user:
        await send_token(database, user, "verify")
    return GENERIC


@router.post("/verify-email", dependencies=[Browser])
async def verify_email(body: TokenInput, request: Request, database: Database):
    await rate_limit(request, "verify")
    entry = await consume_token(database, body.token, "verify")
    await database.users.update_one({"_id": entry["user_id"]}, {"$set": {"email_verified": True}})
    return {"message": "Email verified. You can now sign in."}


@router.post("/forgot-password", status_code=202, dependencies=[Browser])
async def forgot_password(body: EmailInput, request: Request, database: Database):
    await rate_limit(request, "forgot", body.email)
    user = await database.users.find_one({"email": body.email, "email_verified": True})
    if user:
        await send_token(database, user, "reset")
    return GENERIC


@router.post("/reset-password", dependencies=[Browser])
async def reset_password(body: ResetInput, request: Request, database: Database):
    await rate_limit(request, "reset")
    hashed = await hash_password(body.password)
    entry = await consume_token(database, body.token, "reset")
    updated = await database.users.update_one(
        {"_id": entry["user_id"], "credential_version": entry.get("credential_version", 0)},
        {"$set": {"password_hash": hashed}, "$inc": {"credential_version": 1}},
    )
    if not updated.matched_count:
        raise fail("invalid_email_token", "This link has expired or has already been used.", 400)
    await database.auth_sessions.update_many(
        {"user_id": entry["user_id"]}, {"$set": {"revoked_at": now()}}
    )
    await database.auth_email_tokens.update_many(
        {"user_id": entry["user_id"], "purpose": "reset"}, {"$set": {"used_at": now()}}
    )
    return {"message": "Password updated. Sign in again on your devices."}


@router.post("/refresh", response_model=Tokens, dependencies=[Browser])
async def refresh(request: Request, response: Response, database: Database):
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise fail("authentication_required", "Please sign in to continue.")
    return await rotate_session(database, token, response)


@router.post("/logout", status_code=204, dependencies=[Browser])
async def logout(request: Request, response: Response, database: Database):
    token = request.cookies.get(COOKIE_NAME)
    if token:
        try:
            claims = decode_token(token, "refresh")
        except HTTPException:
            claims = None
        if claims:
            await database.auth_sessions.update_one(
                {"_id": claims["sid"], "user_id": claims["sub"]}, {"$set": {"revoked_at": now()}}
            )
    clear_refresh_cookie(response)


@router.post("/logout-all", status_code=204, dependencies=[Browser])
async def logout_all(
    response: Response, database: Database, user: Annotated[dict, Depends(current_user)]
):
    await database.users.update_one({"_id": user["_id"]}, {"$inc": {"credential_version": 1}})
    await database.auth_sessions.update_many(
        {"user_id": user["_id"]}, {"$set": {"revoked_at": now()}}
    )
    clear_refresh_cookie(response)


@router.get("/me", response_model=User)
async def me(user: Annotated[dict, Depends(current_user)]):
    return public_user(user)


@router.get("/google/start")
async def google_start(request: Request, database: Database, return_to: str = "/workspace"):
    return await start_google(request, database, return_to)


@router.get("/google/callback")
async def google_callback(request: Request, database: Database):
    return await finish_google(request, database)
