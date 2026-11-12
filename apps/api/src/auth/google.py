import secrets
from datetime import timedelta
from urllib.parse import urlencode
from uuid import uuid4

import httpx
import jwt
from authlib.common.errors import AuthlibBaseError
from authlib.integrations.httpx_client import AsyncOAuth2Client
from fastapi import HTTPException, Request
from fastapi.responses import RedirectResponse
from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import DuplicateKeyError

from src.auth.schemas import EmailInput
from src.auth.security import digest, fail, now, rate_limit
from src.auth.service import consume_token, new_session, send_token
from src.config import get_settings

GOOGLE_ISSUER = "https://accounts.google.com"
STATE_COOKIE = "noteesta_oauth"
LINK_COOKIE = "noteesta_google_link"
LINK_COOKIE_PATH = "/api/v1/auth/verify-google-email"


def safe_return_path(value: str) -> str:
    if (
        value.startswith("/")
        and not value.startswith("//")
        and "\\" not in value
        and not any(ord(character) < 32 for character in value)
    ):
        return value
    return "/workspace"


def google_client() -> AsyncOAuth2Client:
    settings = get_settings()
    if not settings.google_client_id or not settings.google_client_secret:
        raise fail("google_unavailable", "Google sign-in is not configured.", 503)
    return AsyncOAuth2Client(
        settings.google_client_id,
        settings.google_client_secret,
        redirect_uri=settings.google_redirect_uri,
        scope="openid email profile",
        code_challenge_method="S256",
        timeout=10,
    )


async def start_google(request: Request, database: AsyncDatabase, return_to: str):
    await rate_limit(request, "google")
    state, nonce, verifier, binding = (secrets.token_urlsafe(32) for _ in range(4))
    async with google_client() as client:
        url, _ = client.create_authorization_url(
            f"{GOOGLE_ISSUER}/o/oauth2/v2/auth",
            state=state,
            nonce=nonce,
            code_verifier=verifier,
            code_challenge_method="S256",
        )
    await database.auth_oauth.insert_one(
        {
            "_id": digest(state),
            "nonce": nonce,
            "verifier": verifier,
            "binding": digest(binding),
            "return_to": safe_return_path(return_to),
            "expires_at": now() + timedelta(minutes=10),
        }
    )
    response = RedirectResponse(url, status_code=302)
    response.set_cookie(
        STATE_COOKIE,
        binding,
        max_age=600,
        httponly=True,
        samesite="lax",
        secure=get_settings().app_env != "development",
        path="/api/v1/auth/google",
    )
    return response


async def google_identity(request: Request, transaction: dict) -> dict:
    settings = get_settings()
    async with google_client() as client:
        token = await client.fetch_token(
            "https://oauth2.googleapis.com/token",
            code=request.query_params.get("code"),
            code_verifier=transaction["verifier"],
        )
        keys = (await client.get("https://www.googleapis.com/oauth2/v3/certs")).json()
    key = jwt.PyJWKSet.from_dict(keys)[jwt.get_unverified_header(token["id_token"])["kid"]]
    claims = jwt.decode(
        token["id_token"],
        key,
        algorithms=["RS256"],
        audience=settings.google_client_id,
        issuer=[GOOGLE_ISSUER, "accounts.google.com"],
        options={"require": ["sub", "exp", "iat", "iss", "aud", "nonce"]},
        leeway=30,
    )
    if not isinstance(claims["nonce"], str) or not secrets.compare_digest(
        claims["nonce"], transaction["nonce"]
    ):
        raise ValueError("Invalid nonce.")
    if (
        claims.get("email_verified") is not True
        or not isinstance(claims.get("email"), str)
        or not claims["email"]
    ):
        raise ValueError("Google must verify the email address.")
    if claims.get("azp", settings.google_client_id) != settings.google_client_id:
        raise ValueError("Unexpected authorized party.")
    return dict(claims)


def google_owns_email(identity: dict) -> bool:
    return identity.get("email_verified") is True and (
        identity["email"].lower().endswith("@gmail.com")
        or (isinstance(identity.get("hd"), str) and bool(identity["hd"].strip()))
    )


async def attach_google(database: AsyncDatabase, user: dict, subject: str) -> dict | None:
    update = {"google_sub": subject, "google_link_verified": True, "email_verified": True}
    if not user["email_verified"]:
        update.update(password_hash=None, credential_version=user.get("credential_version", 0) + 1)
    result = await database.users.update_one(
        {
            "_id": user["_id"],
            "email": user["email"],
            "google_sub": user.get("google_sub"),
            "google_link_verified": user.get("google_link_verified"),
            "email_verified": user["email_verified"],
            "credential_version": user.get("credential_version", 0),
        },
        {"$set": update},
    )
    if not result.matched_count:
        return None
    token_query = {"user_id": user["_id"]}
    if user["email_verified"]:
        token_query["purpose"] = "google"
    await database.auth_email_tokens.update_many(token_query, {"$set": {"used_at": now()}})
    return {**user, **update}


async def link_google(
    database: AsyncDatabase, identity: dict, request: Request, binding: str
) -> dict | None:
    email = EmailInput(email=identity["email"]).email
    authoritative = google_owns_email(identity)
    user = await database.users.find_one({"google_sub": identity["sub"]})
    if user and user.get("google_link_verified") is True:
        return user
    if not user:
        user = await database.users.find_one({"email": email})
    if not user:
        user = {
            "_id": str(uuid4()),
            "email": email,
            "display_name": identity.get("name") or email,
            "email_verified": authoritative,
            "password_hash": None,
            "created_at": now(),
            "credential_version": 0,
        }
        if authoritative:
            user.update(google_sub=identity["sub"], google_link_verified=True)
        try:
            await database.users.insert_one(user)
        except DuplicateKeyError:
            return await link_google(database, identity, request, binding)
        if authoritative:
            return user
    if user.get("google_sub") and user["google_sub"] != identity["sub"]:
        raise fail("account_conflict", "Sign in to your existing account to continue.", 409)
    # Legacy links without recorded ownership proof must also pass this check.
    if authoritative and user["email"] == email:
        linked = await attach_google(database, user, identity["sub"])
        if linked is None:
            return await link_google(database, identity, request, binding)
        return linked
    await rate_limit(request, "google-email", user["email"])
    await send_token(database, user, "google", google_sub=identity["sub"], binding=binding)
    return None


async def confirm_google_email(database: AsyncDatabase, token: str, binding: str) -> None:
    entry = await consume_token(database, token, "google", binding=binding)
    user = await database.users.find_one(
        {
            "_id": entry["user_id"],
            "email": entry["email"],
            "credential_version": entry["credential_version"],
            "google_sub": entry["previous_google_sub"],
            "google_link_verified": entry["google_link_verified"],
        }
    )
    if not user or user.get("google_sub") not in {None, entry["google_sub"]}:
        raise fail("invalid_email_token", "This link has expired or has already been used.", 400)
    try:
        linked = await attach_google(database, user, entry["google_sub"])
    except DuplicateKeyError as exc:
        raise fail(
            "account_conflict", "Sign in to your existing account to continue.", 409
        ) from exc
    if linked is None:
        raise fail("invalid_email_token", "This link has expired or has already been used.", 400)


async def finish_google(request: Request, database: AsyncDatabase):
    settings = get_settings()
    transaction = await database.auth_oauth.find_one_and_delete(
        {
            "_id": digest(request.query_params.get("state", "")),
            "binding": digest(request.cookies.get(STATE_COOKIE, "")),
            "expires_at": {"$gt": now()},
        }
    )
    response = RedirectResponse(f"{settings.web_url}/login?error=google_sign_in", status_code=302)
    response.delete_cookie(STATE_COOKIE, path="/api/v1/auth/google")
    if not transaction or request.query_params.get("error") or not request.query_params.get("code"):
        return response
    try:
        identity = await google_identity(request, transaction)
        binding = secrets.token_urlsafe(32)
        user = await link_google(database, identity, request, binding)
    except (
        httpx.HTTPError,
        AuthlibBaseError,
        jwt.PyJWTError,
        ValueError,
        KeyError,
        TypeError,
        HTTPException,
    ):
        return response
    if user is None:
        response.headers["location"] = f"{settings.web_url}/verify-google-email"
        response.set_cookie(
            LINK_COOKIE,
            binding,
            max_age=1800,
            httponly=True,
            samesite="lax",
            secure=settings.app_env != "development",
            path=LINK_COOKIE_PATH,
        )
        return response
    response.headers["location"] = (
        f"{settings.web_url}/auth/callback?{urlencode({'returnTo': transaction['return_to']})}"
    )
    await new_session(database, user, response)
    return response
