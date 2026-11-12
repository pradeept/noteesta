"""Account-scoped provider credentials. Plaintext exists only during an operation."""

import json
from datetime import UTC, datetime

from cryptography.fernet import Fernet, InvalidToken
from pymongo.asynchronous.database import AsyncDatabase

from src.config import get_settings
from src.models.schemas import GenerationSelection, default_generation


class CredentialError(ValueError):
    pass


def _cipher() -> Fernet:
    try:
        value = get_settings().provider_keys_encryption_key.get_secret_value()
        return Fernet(value.encode())
    except (ValueError, TypeError):
        raise CredentialError(
            "Personal keys are unavailable. Ask the administrator to configure "
            "PROVIDER_KEYS_ENCRYPTION_KEY on the API and worker."
        ) from None


def keys_enabled() -> bool:
    try:
        _cipher()
        return True
    except CredentialError:
        return False


async def credential_metadata(database: AsyncDatabase, user_id: str) -> dict[str, dict]:
    # Always project ciphertext out of settings and model-list reads.
    return {
        row["provider"]: row
        async for row in database.provider_credentials.find(
            {"user_id": user_id}, {"encrypted_key": 0}
        )
    }


async def save_key(database: AsyncDatabase, user_id: str, provider: str, api_key: str) -> None:
    # Bind the encrypted value to its owner and provider as well as the Mongo query.
    encrypted = _cipher().encrypt(
        json.dumps({"user_id": user_id, "provider": provider, "key": api_key}).encode()
    )
    await database.provider_credentials.update_one(
        {"user_id": user_id, "provider": provider},
        {
            "$set": {
                "encrypted_key": encrypted.decode(),
                "suffix": api_key[-4:],
                "updated_at": datetime.now(UTC),
                "tested_models": [],
            }
        },
        upsert=True,
    )


async def load_key(database: AsyncDatabase, user_id: str, provider: str) -> str | None:
    credential = await load_credential(database, user_id, provider)
    return credential[0] if credential else None


async def load_credential(
    database: AsyncDatabase, user_id: str, provider: str
) -> tuple[str, str] | None:
    row = await database.provider_credentials.find_one({"user_id": user_id, "provider": provider})
    if row is None:
        return None
    try:
        payload = json.loads(_cipher().decrypt(row["encrypted_key"].encode()))
        if payload["user_id"] != user_id or payload["provider"] != provider:
            raise ValueError
        return payload["key"], row["encrypted_key"]
    except CredentialError:
        raise
    except (InvalidToken, ValueError, TypeError, KeyError):
        raise CredentialError(
            "The saved key could not be decrypted. Replace it in Settings."
        ) from None


async def delete_key(database: AsyncDatabase, user_id: str, provider: str) -> None:
    await database.provider_credentials.delete_one({"user_id": user_id, "provider": provider})


async def preferred_generation(database: AsyncDatabase, user_id: str) -> GenerationSelection:
    row = await database.ai_settings.find_one({"_id": user_id})
    if row and row.get("default_generation"):
        return GenerationSelection.model_validate(row["default_generation"])
    return default_generation()
