import json
import re
from io import BytesIO
from pathlib import Path
from typing import Annotated
from urllib.parse import urlparse
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from pymongo.asynchronous.database import AsyncDatabase

from noteesta_api.config import get_settings
from noteesta_api.database import database_dependency
from noteesta_api.dependencies import current_user_id
from noteesta_api.repository import PillRepository
from noteesta_api.schemas import AskRequest, ChatAnswer, MaterialKey, Source, StudyPill
from noteesta_api.services.chat import answer_question
from noteesta_api.services.exporting import build_export
from noteesta_api.storage import get_storage
from noteesta_api.tasks import process_pill_task

router = APIRouter(prefix="/pills", tags=["study-pills"])


@router.get("", response_model=list[StudyPill])
async def list_study_pills(
    user_id: Annotated[str, Depends(current_user_id)],
    database: Annotated[AsyncDatabase, Depends(database_dependency)],
) -> list[StudyPill]:
    return await PillRepository(database).list_for_user(user_id)


@router.post("", response_model=StudyPill, status_code=status.HTTP_202_ACCEPTED)
async def create_study_pill(
    user_id: Annotated[str, Depends(current_user_id)],
    database: Annotated[AsyncDatabase, Depends(database_dependency)],
    title: Annotated[str, Form(min_length=1, max_length=100)],
    subject: Annotated[str, Form(min_length=1, max_length=60)],
    selected_materials: Annotated[str, Form()] = '["notes"]',
    detail_level: Annotated[str, Form()] = "balanced",
    learner_level: Annotated[str, Form()] = "intermediate",
    target_exam_date: Annotated[str, Form()] = "",
    study_hours_per_day: Annotated[str, Form()] = "",
    youtube_url: Annotated[str, Form()] = "",
    files: Annotated[list[UploadFile] | None, File()] = None,
) -> StudyPill:
    settings = get_settings()
    if detail_level not in {"concise", "balanced", "detailed"}:
        raise HTTPException(status_code=422, detail="Detail level is invalid.")
    if learner_level not in {"beginner", "intermediate", "advanced"}:
        raise HTTPException(status_code=422, detail="Learner level is invalid.")
    try:
        hours = float(study_hours_per_day) if study_hours_per_day else None
    except ValueError as error:
        raise HTTPException(
            status_code=422, detail="Study hours must be a number."
        ) from error
    if hours is not None and not 0.25 <= hours <= 16:
        raise HTTPException(
            status_code=422, detail="Study hours must be between 0.25 and 16."
        )

    try:
        parsed_materials = [
            MaterialKey(item) for item in json.loads(selected_materials)
        ]
    except (ValueError, TypeError, json.JSONDecodeError) as error:
        raise HTTPException(
            status_code=422, detail="Selected materials are invalid."
        ) from error
    if MaterialKey.notes not in parsed_materials:
        parsed_materials.insert(0, MaterialKey.notes)

    normalized_youtube_url = youtube_url.strip()
    if normalized_youtube_url and not _is_youtube_url(normalized_youtube_url):
        raise HTTPException(status_code=422, detail="Enter a valid YouTube link.")

    # Validate form fields before writing source objects so rejected requests do
    # not leave orphaned uploads in object storage.
    pending_uploads: list[tuple[UploadFile, bytes]] = []
    for upload in files or []:
        content = await upload.read(settings.max_upload_bytes + 1)
        if len(content) > settings.max_upload_bytes:
            raise HTTPException(
                status_code=413,
                detail=f"{upload.filename} exceeds the upload limit.",
            )
        pending_uploads.append((upload, content))

    storage = get_storage()
    pill_id = str(uuid4())
    sources: list[Source] = []
    for upload, content in pending_uploads:
        source_id = str(uuid4())
        filename = Path(upload.filename or "source").name
        object_key = f"users/{user_id}/pills/{pill_id}/originals/{source_id}-{filename}"
        await storage.put_bytes(
            object_key,
            content,
            upload.content_type or "application/octet-stream",
        )
        sources.append(
            Source(
                id=source_id,
                name=filename,
                kind=_source_kind(filename, upload.content_type or ""),
                detail=_file_detail(len(content)),
                object_key=object_key,
            )
        )

    if normalized_youtube_url:
        sources.append(
            Source(
                id=str(uuid4()),
                name="YouTube lesson",
                kind="youtube",
                detail="YouTube captions",
                url=normalized_youtube_url,
            )
        )
    if not sources:
        raise HTTPException(
            status_code=422, detail="Add at least one file or a YouTube link."
        )

    pill = StudyPill(
        id=pill_id,
        user_id=user_id,
        title=title.strip(),
        subject=subject.strip(),
        status="queued",
        progress=2,
        stage="Waiting for a worker",
        selected_materials=parsed_materials,
        sources=sources,
        settings={
            "detail_level": detail_level,
            "learner_level": learner_level,
            "target_exam_date": target_exam_date or None,
            "study_hours_per_day": hours,
        },
    )
    await PillRepository(database).create(pill)
    process_pill_task.delay(pill.id)
    return pill


@router.get("/{pill_id}", response_model=StudyPill)
async def get_study_pill(
    pill_id: str,
    user_id: Annotated[str, Depends(current_user_id)],
    database: Annotated[AsyncDatabase, Depends(database_dependency)],
) -> StudyPill:
    pill = await PillRepository(database).get(pill_id, user_id)
    if pill is None:
        raise HTTPException(status_code=404, detail="Study Pill not found.")
    if pill.artifact:
        storage = get_storage()
        for visual in pill.artifact.visuals:
            if visual.asset_key:
                visual.asset_url = await storage.presigned_url(visual.asset_key)
    return pill


@router.post("/{pill_id}/chat", response_model=ChatAnswer)
async def chat_with_pill(
    pill_id: str,
    body: AskRequest,
    user_id: Annotated[str, Depends(current_user_id)],
    database: Annotated[AsyncDatabase, Depends(database_dependency)],
) -> ChatAnswer:
    pill = await PillRepository(database).get(pill_id, user_id)
    if pill is None:
        raise HTTPException(status_code=404, detail="Study Pill not found.")
    if pill.status != "ready":
        raise HTTPException(
            status_code=409, detail="This Study Pill is still being processed."
        )
    return await answer_question(
        database, pill_id=pill_id, user_id=user_id, question=body.question
    )


@router.post(
    "/{pill_id}/retry", response_model=StudyPill, status_code=status.HTTP_202_ACCEPTED
)
async def retry_study_pill(
    pill_id: str,
    user_id: Annotated[str, Depends(current_user_id)],
    database: Annotated[AsyncDatabase, Depends(database_dependency)],
) -> StudyPill:
    repository = PillRepository(database)
    pill = await repository.get(pill_id, user_id)
    if pill is None:
        raise HTTPException(status_code=404, detail="Study Pill not found.")
    if pill.status not in {"failed", "ready"}:
        raise HTTPException(
            status_code=409, detail="This Study Pill is already being processed."
        )
    updated = await repository.update(
        pill_id,
        status="queued",
        progress=2,
        stage="Waiting for a worker",
        error=None,
    )
    process_pill_task.delay(pill_id)
    if updated is None:
        raise HTTPException(status_code=404, detail="Study Pill not found.")
    return updated


@router.post("/{pill_id}/export")
async def export_study_pill(
    pill_id: str,
    user_id: Annotated[str, Depends(current_user_id)],
    database: Annotated[AsyncDatabase, Depends(database_dependency)],
) -> StreamingResponse:
    pill = await PillRepository(database).get(pill_id, user_id)
    if pill is None:
        raise HTTPException(status_code=404, detail="Study Pill not found.")
    if pill.status != "ready" or not pill.artifact:
        raise HTTPException(
            status_code=409, detail="This Study Pill is not ready to export."
        )
    archive = await build_export(pill, get_storage())
    filename = re.sub(r"[^a-z0-9]+", "-", pill.title.lower()).strip("-")[:80]
    filename = filename or "study-pill"
    return StreamingResponse(
        BytesIO(archive),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}.zip"'},
    )


def _source_kind(filename: str, content_type: str) -> str:
    suffix = Path(filename).suffix.lower()
    if content_type.startswith("audio/"):
        return "audio"
    if content_type.startswith("video/"):
        return "video"
    if content_type.startswith("image/"):
        return "image"
    if suffix == ".pdf":
        return "pdf"
    return "document"


def _is_youtube_url(value: str) -> bool:
    parsed = urlparse(value)
    hostname = (parsed.hostname or "").lower()
    return parsed.scheme in {"http", "https"} and (
        hostname == "youtu.be"
        or hostname == "youtube.com"
        or hostname.endswith(".youtube.com")
    )


def _file_detail(size: int) -> str:
    if size < 1024 * 1024:
        return f"{max(1, round(size / 1024))} KB"
    return f"{size / (1024 * 1024):.1f} MB"
