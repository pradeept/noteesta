import json
import os
from html import escape
from pathlib import Path
from urllib.parse import urlencode

import httpx

from src.auth.security import digest, fail
from src.config import get_settings


async def send_account_email(email: str, token: str, purpose: str) -> None:
    settings = get_settings()
    path = "verify-email" if purpose == "verify" else "reset-password"
    action = "Verify your email" if purpose == "verify" else "Reset your password"
    url = f"{settings.web_url.rstrip('/')}/{path}?{urlencode({'token': token})}"
    payload = {
        "from": settings.email_from,
        "to": [email],
        "subject": f"{action} · Noteesta",
        "text": f"{action}: {url}\nIf you did not request this, you can ignore this email.",
        "html": f'<p>{action} to continue with Noteesta.</p><p><a href="{escape(url)}">'
        f"{action}</a></p><p>If you did not request this, you can ignore this email.</p>",
    }
    if settings.email_adapter == "local" and settings.app_env == "development":
        directory = Path(settings.local_email_directory)
        directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        filename = directory / f"{digest(token)}.json"
        with os.fdopen(os.open(filename, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "w") as file:
            json.dump(payload, file)
        return
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(
                "https://api.resend.com/emails",
                json=payload,
                headers={
                    "Authorization": f"Bearer {settings.resend_api_key}",
                    "Idempotency-Key": digest(token),
                },
            )
            response.raise_for_status()
    except httpx.HTTPError as exc:
        raise fail(
            "email_unavailable", "Email delivery is unavailable. Please try again.", 503
        ) from exc
