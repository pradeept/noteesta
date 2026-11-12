import asyncio
import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from functools import lru_cache

import jwt
from fastapi import HTTPException, Request
from pwdlib import PasswordHash
from pydantic import NameEmail, TypeAdapter, ValidationError
from redis.asyncio import Redis
from redis.exceptions import RedisError

from src.config import get_settings

passwords = PasswordHash.recommended()
_development_secret = secrets.token_urlsafe(48)
_dummy_hash = passwords.hash(secrets.token_urlsafe(32))


def now() -> datetime:
    return datetime.now(UTC)


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def fail(code: str, message: str, status: int = 401) -> HTTPException:
    return HTTPException(status, detail={"code": code, "message": message})


def validate_auth_settings() -> None:
    settings = get_settings()
    if settings.jwt_secret and len(settings.jwt_secret) < 32:
        raise RuntimeError("JWT_SECRET must contain at least 32 characters.")
    if settings.email_adapter not in {"local", "resend"}:
        raise RuntimeError("EMAIL_ADAPTER must be local or resend.")
    if settings.email_adapter == "resend":
        if not settings.resend_api_key:
            raise RuntimeError("EMAIL_ADAPTER=resend requires RESEND_API_KEY.")
        try:
            TypeAdapter(NameEmail).validate_python(settings.email_from)
        except ValidationError as exc:
            raise RuntimeError(
                "EMAIL_FROM must be an email address or use Name <email@example.com> format."
            ) from exc
    if settings.app_env != "development":
        if not settings.jwt_secret or settings.email_adapter != "resend":
            raise RuntimeError("Production requires JWT_SECRET and EMAIL_ADAPTER=resend.")
        if not settings.resend_api_key or not settings.web_url.startswith("https://"):
            raise RuntimeError("Production requires RESEND_API_KEY and an HTTPS WEB_URL.")
        if settings.web_url not in settings.cors_origins or any(
            not origin.startswith("https://") or "*" in origin for origin in settings.cors_origins
        ):
            raise RuntimeError(
                "Production CORS_ORIGINS must include WEB_URL and exact HTTPS origins."
            )
        if settings.google_client_id and not settings.google_redirect_uri.startswith("https://"):
            raise RuntimeError("Production Google callbacks require HTTPS.")


def encode_token(user_id: str, session_id: str, purpose: str, expires: datetime) -> str:
    settings = get_settings()
    return jwt.encode(
        {
            "sub": user_id,
            "sid": session_id,
            "purpose": purpose,
            "jti": secrets.token_urlsafe(24),
            "iat": now(),
            "exp": expires,
            "iss": settings.jwt_issuer,
            "aud": settings.jwt_audience,
        },
        settings.jwt_secret or _development_secret,
        algorithm="HS256",
    )


def decode_token(token: str, purpose: str) -> dict:
    settings = get_settings()
    try:
        claims = jwt.decode(
            token,
            settings.jwt_secret or _development_secret,
            algorithms=["HS256"],
            issuer=settings.jwt_issuer,
            audience=settings.jwt_audience,
            options={"require": ["sub", "sid", "purpose", "jti", "iat", "exp", "iss", "aud"]},
        )
        if claims["purpose"] != purpose or not all(
            isinstance(claims[key], str) and claims[key] for key in ("sub", "sid", "jti")
        ):
            raise jwt.InvalidTokenError()
        return claims
    except jwt.InvalidTokenError as exc:
        raise fail("invalid_token", "Your session has expired. Please sign in again.") from exc


async def hash_password(value: str) -> str:
    return await asyncio.to_thread(passwords.hash, value)


async def verify_password(value: str, hashed: str | None) -> bool:
    valid = await asyncio.to_thread(passwords.verify, value, hashed or _dummy_hash)
    return valid and hashed is not None


async def browser_request(request: Request) -> None:
    settings = get_settings()
    if request.headers.get("origin") not in settings.cors_origins or (
        request.headers.get("x-noteesta-client") != "web"
    ):
        raise fail("invalid_origin", "This request origin is not allowed.", 403)


@lru_cache
def rate_store() -> Redis:
    return Redis.from_url(get_settings().redis_url, decode_responses=True)


async def rate_limit(request: Request, action: str, email: str = "") -> None:
    # Do not trust a client-supplied X-Forwarded-For header.
    ip = request.client.host if request.client else "unknown"
    rules = [(f"{action}:ip:{digest(ip)}", 30, 900)]
    if email:
        rules.append((f"{action}:email:{digest(email)}", 5 if action == "login" else 3, 900))
    script = """
    local count = redis.call('INCR', KEYS[1])
    if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
    return count
    """
    try:
        for key, limit, seconds in rules:
            count = await rate_store().eval(script, 1, f"auth:rate:{key}", seconds)
            if count > limit:
                raise HTTPException(
                    429,
                    detail={
                        "code": "rate_limited",
                        "message": "Too many attempts. Please try again later.",
                    },
                    headers={"Retry-After": str(seconds)},
                )
    except RedisError as exc:
        raise fail(
            "auth_unavailable", "Sign-in is temporarily unavailable. Try again shortly.", 503
        ) from exc


def access_expiry() -> datetime:
    return now() + timedelta(minutes=get_settings().access_token_minutes)
