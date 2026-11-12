from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import ValidationError
from pymongo.asynchronous.database import AsyncDatabase

from src.ai_settings import (
    CredentialError,
    credential_metadata,
    delete_key,
    keys_enabled,
    load_credential,
    preferred_generation,
    save_key,
)
from src.common.schemas.schemas import HostedProvider
from src.database import database_dependency
from src.dependencies.profile import current_user_id
from src.generation import (
    PRESETS,
    PROVIDER_LABELS,
    GenerationError,
    available_options,
    generation_client,
    valid_selection,
)
from src.models.schemas import GenerationSelection
from src.settings.schemas import (
    AISettings,
    AISettingsUpdate,
    ConnectionTest,
    ProviderKeyUpdate,
    ProviderStatus,
)

router = APIRouter(prefix="/settings/ai", tags=["settings"])
User = Annotated[str, Depends(current_user_id)]
Database = Annotated[AsyncDatabase, Depends(database_dependency)]


@router.get("", response_model=AISettings)
async def get_ai_settings(user_id: User, database: Database) -> AISettings:
    rows = await credential_metadata(database, user_id)
    enabled = keys_enabled()
    return AISettings(
        default_generation=await preferred_generation(database, user_id),
        keys_enabled=enabled,
        providers=[
            ProviderStatus(
                provider=provider,
                label=PROVIDER_LABELS[provider],
                configured=provider in rows,
                suffix=rows.get(provider, {}).get("suffix"),
                updated_at=rows.get(provider, {}).get("updated_at"),
                tested_models=rows.get(provider, {}).get("tested_models", []),
            )
            for provider in PRESETS
        ],
        models=await available_options(set(rows) if enabled else set()),
    )


@router.patch("", response_model=GenerationSelection)
async def update_ai_settings(body: AISettingsUpdate, user_id: User, database: Database):
    if not valid_selection(body.default_generation):
        raise HTTPException(422, "Choose a supported model preset.")
    await database.ai_settings.update_one(
        {"_id": user_id},
        {"$set": {"default_generation": body.default_generation.model_dump(by_alias=False)}},
        upsert=True,
    )
    return body.default_generation


@router.patch("/providers/{provider}", status_code=204)
async def update_provider_key(
    provider: HostedProvider,
    request: Request,
    user_id: User,
    database: Database,
):
    # Do not let validation errors contain the incoming secret, even for invalid
    # types, extra properties or malformed JSON. Never log this request body.
    try:
        if int(request.headers.get("content-length", "0")) > 16384:
            raise ValueError
        raw = await request.body()
        if len(raw) > 16384:
            raise ValueError
        body = ProviderKeyUpdate.model_validate_json(raw)
        key = body.api_key.get_secret_value().strip()
        if not 8 <= len(key) <= 4096 or any(char.isspace() for char in key):
            raise ValueError
    except (ValueError, ValidationError):
        raise HTTPException(
            422, "Enter a valid API key (8–4096 characters, without spaces)."
        ) from None
    try:
        await save_key(database, user_id, provider, key)
    except CredentialError as error:
        raise HTTPException(503, str(error)) from None
    return Response(status_code=204)


@router.delete("/providers/{provider}", status_code=204)
async def remove_provider_key(provider: HostedProvider, user_id: User, database: Database):
    await delete_key(database, user_id, provider)
    return Response(status_code=204)


@router.post("/providers/{provider}/test")
async def test_provider_key(
    provider: HostedProvider,
    body: ConnectionTest,
    user_id: User,
    database: Database,
):
    selection = GenerationSelection(provider=provider, model=body.model)
    if not valid_selection(selection):
        raise HTTPException(422, "Choose a supported model preset.")
    try:
        credential = await load_credential(database, user_id, provider)
        if credential is None:
            raise HTTPException(409, "Save a personal key before testing this provider.")
        key, encrypted_key = credential
        # No study sources and no Ollama dependency for this explicit test.
        await generation_client(selection, key).generate_json(
            'Return a JSON object with "connected" set to true.',
            {
                "type": "object",
                "properties": {"connected": {"enum": [True], "type": "boolean"}},
                "required": ["connected"],
                "additionalProperties": False,
            },
            num_predict=128,
        )
    except CredentialError as error:
        raise HTTPException(503, str(error)) from None
    except GenerationError as error:
        raise HTTPException(502, str(error)) from None
    # Only mark the tested credential version. A replacement during the request
    # must not inherit the previous key's verification.
    await database.provider_credentials.update_one(
        {"user_id": user_id, "provider": provider, "encrypted_key": encrypted_key},
        {"$addToSet": {"tested_models": body.model}},
    )
    return {"connected": True, "model": body.model}
