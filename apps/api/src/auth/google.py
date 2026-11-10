import secrets
from datetime import timedelta
from urllib.parse import urlencode
from uuid import uuid4

import httpx
import jwt
from authlib.common.errors import AuthlibBaseError
from authlib.integrations.httpx_client import AsyncOAuth2Client
from fastapi import Request
from fastapi.responses import RedirectResponse
from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import DuplicateKeyError

from src.auth.security import digest, fail, now, rate_limit
from src.auth.service import new_session
from src.config import get_settings

GOOGLE_ISSUER = "https://accounts.google.com"
STATE_COOKIE = "noteesta_oauth"


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


async def link_google(database: AsyncDatabase, identity: dict) -> dict:
    user = await database.users.find_one({"google_sub": identity["sub"]})
    if user:
        return user
    email = identity["email"].lower()
    user = await database.users.find_one({"email": email})
    if not user:
        user = {
            "_id": str(uuid4()),
            "email": email,
            "display_name": identity.get("name") or email,
            "email_verified": True,
            "google_sub": identity["sub"],
            "password_hash": None,
            "created_at": now(),
            "credential_version": 0,
        }
        try:
            await database.users.insert_one(user)
            return user
        except DuplicateKeyError:
            return await link_google(database, identity)
    if user.get("google_sub") and user["google_sub"] != identity["sub"]:
        raise fail("account_conflict", "Sign in to your existing account to continue.", 409)
    update = {"google_sub": identity["sub"], "email_verified": True}
    if not user["email_verified"]:
        update.update(password_hash=None, credential_version=user.get("credential_version", 0) + 1)
    result = await database.users.update_one(
        {
            "_id": user["_id"],
            "google_sub": user.get("google_sub"),
            "email_verified": user["email_verified"],
            "credential_version": user.get("credential_version", 0),
        },
        {"$set": update},
    )
    if not result.matched_count:
        return await link_google(database, identity)
    if not user["email_verified"]:
        await database.auth_email_tokens.update_many(
            {"user_id": user["_id"]}, {"$set": {"used_at": now()}}
        )
    return {**user, **update}


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
        user = await link_google(database, identity)
    except (httpx.HTTPError, AuthlibBaseError, jwt.PyJWTError, ValueError, KeyError, TypeError):
        return response
    response.headers["location"] = (
        f"{settings.web_url}/auth/callback?{urlencode({'returnTo': transaction['return_to']})}"
    )
    await new_session(database, user, response)
    return response
