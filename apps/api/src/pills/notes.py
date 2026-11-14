"""Versioned notes. Snapshots are immutable; the Pill pointer is the commit boundary."""

import hashlib
import html
import json
import re
from datetime import UTC, datetime
from typing import Annotated, Any
from urllib.parse import quote, urlsplit
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import DuplicateKeyError

from src.common.schemas.schemas import ApiModel, StudyArtifact, VisualSpec
from src.database import database_dependency
from src.dependencies.profile import current_user_id
from src.pills.schemas import StudyPill
from src.repository import PillRepository, artifact_for_storage
from src.storage import get_storage

router = APIRouter(prefix="/pills/{pill_id}/notes", tags=["notes"])
MAX_DOCUMENT_BYTES = 1_000_000
COLORS = {"#1f2937", "#166534", "#1d4ed8", "#7e22ce", "#b91c1c"}
HIGHLIGHTS = {"#fef08a", "#bbf7d0", "#bfdbfe", "#e9d5ff", "#fed7aa"}
Database = Annotated[AsyncDatabase, Depends(database_dependency)]


class SaveNotes(ApiModel):
    document: dict[str, Any]
    base_revision_id: str
    mutation_id: UUID


class RestoreNotes(ApiModel):
    base_revision_id: str
    mutation_id: UUID


def conflict() -> HTTPException:
    return HTTPException(
        409,
        detail={
            "code": "notes_conflict",
            "message": "Notes changed elsewhere. Copy your draft before loading the current notes.",
        },
    )


def text_content(node: dict) -> str:
    if node["type"] == "hardBreak":
        return "\n"
    if "text" in node:
        return node["text"]
    separator = "" if node["type"] in {"paragraph", "heading", "codeBlock"} else "\n"
    return separator.join(text_content(child) for child in node.get("content", []))


def validate_document(document: dict, references: dict, visuals: list[dict]) -> None:
    """Accept only our editor schema; never persist arbitrary HTML or reference payloads."""
    try:
        encoded_size = len(json.dumps(document, ensure_ascii=False).encode())
    except (RecursionError, ValueError):
        raise HTTPException(422, "Invalid document structure.") from None
    if encoded_size > MAX_DOCUMENT_BYTES:
        raise HTTPException(413, "Notes must be smaller than 1 MB.")
    sections: set[str] = set()
    visual_ids = {visual["id"] for visual in visuals}
    structures = {
        "doc": {"noteSummary", "noteSection"},
        "noteSummary": {"paragraph", "bulletList", "orderedList", "blockquote", "heading"},
        "noteSection": {
            "heading",
            "paragraph",
            "bulletList",
            "orderedList",
            "blockquote",
            "codeBlock",
            "horizontalRule",
            "table",
            "noteVisual",
        },
        "paragraph": {"text", "hardBreak"},
        "heading": {"text", "hardBreak"},
        "bulletList": {"listItem"},
        "orderedList": {"listItem"},
        "listItem": {"paragraph", "bulletList", "orderedList", "blockquote", "codeBlock"},
        "blockquote": {"paragraph", "bulletList", "orderedList", "heading", "codeBlock"},
        "codeBlock": {"text"},
        "table": {"tableRow"},
        "tableRow": {"tableCell", "tableHeader"},
        "tableCell": {"paragraph", "bulletList", "orderedList"},
        "tableHeader": {"paragraph", "bulletList", "orderedList"},
        "text": set(),
        "hardBreak": set(),
        "horizontalRule": set(),
        "noteVisual": set(),
    }
    blocks = structures["noteSection"]
    for container in ("noteSummary", "blockquote", "tableCell", "tableHeader"):
        structures[container] = blocks
    structures["listItem"] = blocks
    allowed_attrs = {
        "noteSection": {"id", "citationIds"},
        "noteVisual": {"id"},
        "heading": {"level"},
        "orderedList": {"start", "type"},
        "codeBlock": {"language"},
        "tableCell": {"colspan", "rowspan", "colwidth", "align"},
        "tableHeader": {"colspan", "rowspan", "colwidth", "align"},
    }

    def walk(node: Any, depth: int = 0) -> None:
        if not isinstance(node, dict) or depth > 30:
            raise ValueError("Invalid document structure.")
        kind = node.get("type")
        if kind not in structures or set(node) - {"type", "attrs", "content", "text", "marks"}:
            raise ValueError("Unsupported document node.")
        attrs = node.get("attrs", {})
        if not isinstance(attrs, dict) or set(attrs) - allowed_attrs.get(kind, set()):
            raise ValueError("Unsupported node attributes.")
        children = node.get("content", [])
        if not isinstance(children, list):
            raise ValueError("Invalid content.")
        if any(
            not isinstance(child, dict) or child.get("type") not in structures[kind]
            for child in children
        ):
            raise ValueError("Invalid child node.")
        if kind == "doc":
            types = [child["type"] for child in children]
            if (
                not types
                or types.count("noteSummary") > 1
                or ("noteSummary" in types and types[0] != "noteSummary")
                or "noteSection" not in types
            ):
                raise ValueError("Notes need at least one section.")
        if kind == "noteSection":
            section_id = attrs.get("id", "")
            if (
                not isinstance(section_id, str)
                or not section_id.strip()
                or len(section_id) > 1000
                or re.search(r"[\x00-\x1f]", section_id)
                or section_id in sections
            ):
                raise ValueError("Section IDs must be unique.")
            sections.add(section_id)
            ids = attrs.get("citationIds", [])
            if not isinstance(ids, list) or any(
                not isinstance(ref, str) or ref not in references for ref in ids
            ):
                raise ValueError("Unknown citation reference.")
            if (
                len(children) < 2
                or children[0].get("type") != "heading"
                or children[0].get("attrs", {}).get("level") != 2
            ):
                raise ValueError("Sections need a title and body.")
        if kind == "noteVisual" and attrs.get("id") not in visual_ids:
            raise ValueError("Unknown visual reference.")
        if kind == "heading" and attrs.get("level") not in {2, 3, 4}:
            raise ValueError("Unsupported heading level.")
        if kind == "text" and (
            not isinstance(node.get("text"), str) or not node.get("text") or children
        ):
            raise ValueError("Invalid text.")
        if (
            kind
            in {
                "noteSummary",
                "blockquote",
                "bulletList",
                "orderedList",
                "listItem",
                "table",
                "tableRow",
                "tableCell",
                "tableHeader",
            }
            and not children
        ):
            raise ValueError("This block cannot be empty.")
        if kind == "listItem" and children[0].get("type") != "paragraph":
            raise ValueError("List items must begin with a paragraph.")
        if kind != "text" and "text" in node:
            raise ValueError("Only text nodes contain text.")
        for key in ("rowspan", "colspan"):
            if key in attrs and (not isinstance(attrs[key], int) or not 1 <= attrs[key] <= 100):
                raise ValueError("Invalid table dimensions.")
        if (
            "colwidth" in attrs
            and attrs["colwidth"] is not None
            and (
                not isinstance(attrs["colwidth"], list)
                or any(
                    not isinstance(width, int) or not 0 <= width <= 10000
                    for width in attrs["colwidth"]
                )
            )
        ):
            raise ValueError("Invalid table widths.")
        if "start" in attrs and (
            not isinstance(attrs["start"], int) or not 1 <= attrs["start"] <= 100000
        ):
            raise ValueError("Invalid list start.")
        if "type" in attrs and attrs["type"] not in {None, "1", "a", "A", "i", "I"}:
            raise ValueError("Invalid list style.")
        if "align" in attrs and attrs["align"] not in {None, "left", "center", "right"}:
            raise ValueError("Invalid table alignment.")
        if (
            "language" in attrs
            and attrs["language"] is not None
            and not re.fullmatch(r"[\w#+.-]{0,50}", str(attrs["language"]))
        ):
            raise ValueError("Invalid code language.")
        marks = node.get("marks", [])
        if not isinstance(marks, list) or (marks and kind not in {"text", "hardBreak"}):
            raise ValueError("Invalid text formatting.")
        for mark in marks:
            if not isinstance(mark, dict) or set(mark) - {"type", "attrs"}:
                raise ValueError("Invalid formatting.")
            name, settings = mark.get("type"), mark.get("attrs", {})
            if not isinstance(settings, dict):
                raise ValueError("Invalid formatting attributes.")
            if name in {"bold", "italic", "underline", "strike", "code"}:
                if settings:
                    raise ValueError("Unsupported formatting attributes.")
            elif name in {"highlight", "textStyle"}:
                palette = HIGHLIGHTS if name == "highlight" else COLORS
                if set(settings) - {"color"} or settings.get("color") not in palette:
                    raise ValueError("Unsupported color.")
            elif name == "link":
                if (
                    set(settings) - {"href", "target", "rel", "class", "title"}
                    or not isinstance(settings.get("href"), str)
                    or urlsplit(settings["href"]).scheme.lower() not in {"http", "https", "mailto"}
                ):
                    raise ValueError("Links must use https, http, or mailto.")
                if (
                    settings.get("target") not in {None, "_blank"}
                    or settings.get("class") is not None
                    or settings.get("rel")
                    not in {None, "noopener noreferrer nofollow", "noopener noreferrer"}
                ):
                    raise ValueError("Unsupported link attributes.")
                if settings.get("title") is not None and (
                    not isinstance(settings["title"], str) or len(settings["title"]) > 500
                ):
                    raise ValueError("Invalid link title.")
            else:
                raise ValueError("Unsupported text formatting.")
        for child in children:
            walk(child, depth + 1)

    try:
        if document.get("type") != "doc":
            raise ValueError("Invalid document root.")
        walk(document)
    except (ValueError, TypeError, KeyError) as error:
        raise HTTPException(422, str(error)) from None


def generated_content(artifact: StudyArtifact) -> dict:
    references = {}
    sections = []
    for section in artifact.sections:
        ids = []
        for citation in section.citations:
            value = citation.model_dump(mode="json", by_alias=True)
            ref = hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()[:24]
            references[ref] = value
            ids.append(ref)
        sections.append(
            {
                "id": section.id,
                "title": section.title,
                "markdown": section.markdown,
                "citationIds": ids,
            }
        )
    return {
        "document": None,
        "generated": {"summary": artifact.summary, "sections": sections},
        "references": references,
        "visuals": artifact_for_storage(artifact)["visuals"],
    }


class NotesRepository:
    def __init__(self, database):
        self.database = database
        self.snapshots = database.pill_note_revisions

    async def revision(self, pill: StudyPill, revision_id: str) -> dict:
        snapshot = await self.snapshots.find_one(
            {"_id": revision_id, "pill_id": pill.id, "user_id": pill.user_id}
        )
        if snapshot is None:
            raise HTTPException(404, "Note version not found.")
        return snapshot

    async def current(self, pill: StudyPill) -> dict:
        if pill.notes_revision_id:
            return await self.revision(pill, pill.notes_revision_id)
        if not pill.artifact:
            raise HTTPException(409, "This Study Pill has no notes yet.")
        snapshot = self.snapshot(pill, generated_content(pill.artifact), None, "generated")
        await self.snapshots.insert_one(snapshot)
        result = await self.database.pills.update_one(
            {"_id": pill.id, "user_id": pill.user_id, "notes_revision_id": None},
            {"$set": {"notes_revision_id": snapshot["_id"]}},
        )
        if result.matched_count:
            pill.notes_revision_id = snapshot["_id"]
            return snapshot
        await self.snapshots.delete_one({"_id": snapshot["_id"]})
        refreshed = await PillRepository(self.database).get(pill.id, pill.user_id)
        return await self.current(refreshed)

    def snapshot(
        self,
        pill: StudyPill,
        content: dict,
        previous: dict | None,
        kind: str,
        mutation_id: str | None = None,
    ) -> dict:
        now = datetime.now(UTC)
        grouped = bool(
            previous
            and kind == "edited"
            and previous["kind"] == "edited"
            and (now - previous["group_started_at"]).total_seconds() < 300
        )
        return {
            "_id": mutation_id or str(uuid4()),
            "pill_id": pill.id,
            "user_id": pill.user_id,
            **{key: content[key] for key in ("document", "generated", "references", "visuals")},
            "kind": kind,
            "created_at": now,
            "group_id": previous["group_id"] if grouped else str(uuid4()),
            "group_started_at": previous["group_started_at"] if grouped else now,
            "previous_group_revision_id": (
                previous["previous_group_revision_id"]
                if grouped
                else previous["_id"] if previous else None
            ),
            "previous_revision_id": previous["_id"] if previous else None,
        }

    async def commit(
        self,
        pill: StudyPill,
        snapshot: dict,
        expected: str | None,
        *,
        status: str = "ready",
        changes: dict | None = None,
    ) -> dict:
        try:
            await self.snapshots.insert_one(snapshot)
        except DuplicateKeyError:
            stored = await self.revision(pill, snapshot["_id"])
            if (
                any(stored[key] != snapshot[key] for key in ("document", "generated", "kind"))
                or stored["previous_revision_id"] != expected
            ):
                raise conflict() from None
            if await self.is_committed(pill, stored["_id"]):
                return stored
            # Resume a prepared snapshot if a previous attempt stopped before advancing the pointer.
            snapshot = stored
        result = await self.database.pills.update_one(
            {
                "_id": pill.id,
                "user_id": pill.user_id,
                "notes_revision_id": expected,
                "status": status,
            },
            {
                "$set": {
                    **(changes or {}),
                    "notes_revision_id": snapshot["_id"],
                    "updated_at": datetime.now(UTC),
                }
            },
        )
        if not result.matched_count:
            # Identical concurrent retries may have already committed this same snapshot.
            if await self.is_committed(pill, snapshot["_id"]):
                return snapshot
            await self.snapshots.delete_one({"_id": snapshot["_id"], "user_id": pill.user_id})
            raise conflict()
        return snapshot

    async def is_committed(self, pill: StudyPill, revision_id: str) -> bool:
        current = await self.database.pills.find_one({"_id": pill.id, "user_id": pill.user_id})
        cursor = current.get("notes_revision_id") if current else None
        while cursor:
            if cursor == revision_id:
                return True
            item = await self.revision(pill, cursor)
            cursor = item.get("previous_revision_id")
        return False

    async def reachable(self, pill: StudyPill, revision_id: str) -> dict:
        cursor = await self.current(pill)
        while cursor:
            if cursor["_id"] == revision_id:
                return cursor
            previous = cursor["previous_group_revision_id"]
            cursor = await self.revision(pill, previous) if previous else None
        raise HTTPException(404, "Note version not found.")


async def owned_pill(pill_id: str, user_id: str, database) -> StudyPill:
    pill = await PillRepository(database).get(pill_id, user_id)
    if pill is None:
        raise HTTPException(404, "Study Pill not found.")
    return pill


def summary(snapshot: dict) -> dict:
    excerpt = (
        text_content(snapshot["document"])
        if snapshot["document"]
        else snapshot["generated"]["summary"]
    )
    return {
        "revisionId": snapshot["_id"],
        "groupId": snapshot["group_id"],
        "createdAt": snapshot["created_at"],
        "kind": snapshot["kind"],
        "excerpt": excerpt[:180],
    }


async def response(snapshot: dict) -> dict:
    visuals = []
    for value in snapshot["visuals"]:
        visual = VisualSpec.model_validate(value)
        if visual.asset_key:
            visual.asset_url = await get_storage().presigned_url(visual.asset_key)
        visuals.append(visual.model_dump(mode="json", by_alias=True))
    return {
        **summary(snapshot),
        "document": snapshot["document"],
        "generated": snapshot["generated"],
        "references": snapshot["references"],
        "visuals": visuals,
    }


@router.get("")
async def get_notes(
    pill_id: str,
    user_id: Annotated[str, Depends(current_user_id)],
    database: Database,
):
    pill = await owned_pill(pill_id, user_id, database)
    return await response(await NotesRepository(database).current(pill))


@router.put("")
async def save_notes(
    pill_id: str,
    body: SaveNotes,
    user_id: Annotated[str, Depends(current_user_id)],
    database: Database,
):
    pill = await owned_pill(pill_id, user_id, database)
    if pill.status != "ready":
        raise HTTPException(409, "Notes cannot be edited while the Pill is processing.")
    repository = NotesRepository(database)
    current = await repository.current(pill)
    validate_document(body.document, current["references"], current["visuals"])
    if current["_id"] == body.base_revision_id and current["document"] == body.document:
        return await response(current)
    content = {**current, "document": body.document, "generated": None}
    snapshot = repository.snapshot(pill, content, current, "edited", str(body.mutation_id))
    return await response(await repository.commit(pill, snapshot, body.base_revision_id))


@router.get("/versions")
async def list_versions(
    pill_id: str,
    user_id: Annotated[str, Depends(current_user_id)],
    database: Database,
    cursor: str | None = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
):
    pill = await owned_pill(pill_id, user_id, database)
    repository = NotesRepository(database)
    current = await repository.current(pill)
    item = await repository.reachable(pill, cursor) if cursor else current
    items = []
    while item and len(items) < limit:
        items.append(summary(item))
        previous = item["previous_group_revision_id"]
        item = await repository.revision(pill, previous) if previous else None
    return {
        "items": items,
        "nextCursor": item["_id"] if item else None,
        "currentRevisionId": current["_id"],
    }


@router.get("/versions/{revision_id}")
async def get_version(
    pill_id: str,
    revision_id: str,
    user_id: Annotated[str, Depends(current_user_id)],
    database: Database,
):
    pill = await owned_pill(pill_id, user_id, database)
    return await response(await NotesRepository(database).reachable(pill, revision_id))


@router.post("/versions/{revision_id}/restore")
async def restore_notes(
    pill_id: str,
    revision_id: str,
    body: RestoreNotes,
    user_id: Annotated[str, Depends(current_user_id)],
    database: Database,
):
    pill = await owned_pill(pill_id, user_id, database)
    if pill.status != "ready":
        raise HTTPException(409, "Notes cannot be restored while the Pill is processing.")
    repository = NotesRepository(database)
    current = await repository.current(pill)
    target = await repository.reachable(pill, revision_id)
    snapshot = repository.snapshot(pill, target, current, "restored", str(body.mutation_id))
    return await response(await repository.commit(pill, snapshot, body.base_revision_id))


def document_markdown(node: dict) -> str:
    """Portable Markdown with escaped inline HTML for the extra text marks."""
    kind, attrs = node["type"], node.get("attrs", {})
    if kind == "text":
        value = html.escape(node["text"])
        value = re.sub(r"([\\`*_{}\[\]<>#|])", r"\\\1", value)
        for mark in node.get("marks", []):
            name, settings = mark["type"], mark.get("attrs", {})
            if name == "bold":
                value = f"**{value}**"
            elif name == "italic":
                value = f"*{value}*"
            elif name == "strike":
                value = f"~~{value}~~"
            elif name == "code":
                fence = "`" * (
                    max([len(run) for run in re.findall(r"`+", node["text"])] or [0]) + 1
                )
                value = f"{fence} {node['text']} {fence}"
            elif name == "underline":
                value = f"<u>{value}</u>"
            elif name == "highlight":
                value = f'<mark style="background-color:{settings["color"]}">{value}</mark>'
            elif name == "textStyle":
                value = f'<span style="color:{settings["color"]}">{value}</span>'
            elif name == "link":
                href = quote(settings["href"], safe=":/?#[]@!$&'*+,;=%")
                value = f"[{value}]({href})"
        return value
    children = node.get("content", [])
    if kind in {"paragraph", "heading", "tableCell", "tableHeader"}:
        separator = "\n" if kind in {"tableCell", "tableHeader"} else ""
        value = separator.join(document_markdown(child) for child in children)
        return f"{'#' * attrs['level']} {value}" if kind == "heading" else value
    if kind == "hardBreak":
        return "  \n"
    if kind == "horizontalRule":
        return "---"
    if kind == "noteVisual":
        return f"![Study visual](assets/{attrs['id']}.png)"
    if kind == "codeBlock":
        value = "".join(child.get("text", "") for child in children)
        fence = "`" * max(3, max([len(run) + 1 for run in re.findall(r"`+", value)] or [0]))
        return f"{fence}{attrs.get('language') or ''}\n{value}\n{fence}"
    if kind in {"bulletList", "orderedList"}:
        lines = []
        for index, child in enumerate(children):
            prefix = f"{index + attrs.get('start', 1)}. " if kind == "orderedList" else "- "
            value = document_markdown(child).replace("\n", "\n" + " " * len(prefix))
            lines.append(prefix + value)
        return "\n".join(lines)
    if kind == "blockquote":
        return "\n".join(
            "> " + line
            for line in "\n\n".join(document_markdown(child) for child in children).splitlines()
        )
    if kind == "table":
        rows = [
            "| "
            + " | ".join(
                document_markdown(cell).replace("\n", "<br>") for cell in row.get("content", [])
            )
            + " |"
            for row in children
        ]
        if rows:
            alignments = {None: "---", "left": ":---", "center": ":---:", "right": "---:"}
            rows.insert(
                1,
                "| "
                + " | ".join(
                    alignments[cell.get("attrs", {}).get("align")]
                    for cell in children[0].get("content", [])
                )
                + " |",
            )
        return "\n".join(rows)
    return "\n\n".join(document_markdown(child) for child in children)
