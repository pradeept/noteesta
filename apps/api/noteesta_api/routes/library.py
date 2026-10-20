from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from pymongo.asynchronous.database import AsyncDatabase

from noteesta_api.database import database_dependency
from noteesta_api.dependencies import current_user_id
from noteesta_api.repository import PillRepository, sources_for_storage
from noteesta_api.schemas import LibraryEntry, LibraryPillReference
from noteesta_api.storage import get_storage

router = APIRouter(prefix="/library", tags=["library"])


@router.get("", response_model=list[LibraryEntry])
async def list_library_sources(
    user_id: Annotated[str, Depends(current_user_id)],
    database: Annotated[AsyncDatabase, Depends(database_dependency)],
) -> list[LibraryEntry]:
    pills = await PillRepository(database).list_for_user(user_id)
    entries = []
    for pill in pills:
        for source in pill.sources:
            entry = LibraryEntry(
                source_id=source.id,
                name=source.name,
                kind=source.kind,
                detail=source.detail,
                original_available=source.original_available,
                youtube_url=source.url,
                pills=[LibraryPillReference(id=pill.id, title=pill.title)],
            )
            entries.append(entry)
    return entries


@router.get("/{source_id}/download")
async def download_library_source(
    source_id: str,
    user_id: Annotated[str, Depends(current_user_id)],
    database: Annotated[AsyncDatabase, Depends(database_dependency)],
) -> RedirectResponse:
    _, source = await _get_source(database, user_id, source_id)
    if source.kind == "youtube":
        raise HTTPException(status_code=409, detail="YouTube sources are links, not stored files.")
    if not source.original_available or not source.object_key:
        raise HTTPException(status_code=410, detail="The original file has been deleted.")
    return RedirectResponse(await get_storage().presigned_url(source.object_key))


@router.delete("/{source_id}", response_model=LibraryEntry)
async def delete_library_source(
    source_id: str,
    user_id: Annotated[str, Depends(current_user_id)],
    database: Annotated[AsyncDatabase, Depends(database_dependency)],
) -> LibraryEntry:
    pill, source = await _get_source(database, user_id, source_id)
    if source.kind == "youtube":
        raise HTTPException(status_code=409, detail="YouTube links cannot be deleted as files.")
    if not source.original_available or not source.object_key:
        raise HTTPException(status_code=410, detail="The original file has already been deleted.")

    source.original_available = False
    await PillRepository(database).update(
        pill.id, sources=sources_for_storage(pill.sources)
    )
    try:
        await get_storage().delete_object(source.object_key)
    except Exception:
        source.original_available = True
        await PillRepository(database).update(
            pill.id, sources=sources_for_storage(pill.sources)
        )
        raise
    return LibraryEntry(
        source_id=source.id,
        name=source.name,
        kind=source.kind,
        detail=source.detail,
        original_available=False,
        youtube_url=None,
        pills=[LibraryPillReference(id=pill.id, title=pill.title)],
    )


async def _get_source(database: AsyncDatabase, user_id: str, source_id: str):
    pills = await PillRepository(database).list_for_user(user_id)
    for pill in pills:
        for source in pill.sources:
            if source.id == source_id:
                return pill, source
    raise HTTPException(status_code=404, detail="Library source not found.")
