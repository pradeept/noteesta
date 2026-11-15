from copy import deepcopy
from datetime import UTC, datetime, timedelta
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4
from zipfile import ZipFile

import pytest
from fakes import FakeTable
from fastapi.testclient import TestClient

from src.database import database_dependency
from src.dependencies.profile import current_user_id
from src.main import app
from src.pills import notes
from src.pills.schemas import StudyPill
from src.repository import _serialize
from src.services.exporting import build_export


@pytest.fixture
def notes_api(monkeypatch):
    pill = StudyPill.model_validate(
        {
            "id": "pill",
            "user_id": "alice",
            "title": "Cells",
            "subject": "Biology",
            "status": "ready",
            "artifact": {
                "summary": "Cell biology",
                "sections": [
                    {
                        "id": "cells",
                        "title": "Cells",
                        "markdown": "Cells contain a nucleus.",
                        "citations": [
                            {
                                "sourceId": "source",
                                "sourceName": "Lecture",
                                "locator": "p1",
                                "excerpt": "Cells",
                            }
                        ],
                    },
                ],
            },
        }
    )
    database = SimpleNamespace(pills=FakeTable([_serialize(pill)]), pill_note_revisions=FakeTable())
    identity = {"user": "alice"}
    monkeypatch.setitem(app.dependency_overrides, database_dependency, lambda: database)
    monkeypatch.setitem(app.dependency_overrides, current_user_id, lambda: identity["user"])
    client = TestClient(app)
    yield client, database, identity
    client.close()


def rich_document(text="Edited cells", citation_ids=()):
    return {
        "type": "doc",
        "content": [
            {
                "type": "noteSection",
                "attrs": {"id": "cells", "citationIds": list(citation_ids)},
                "content": [
                    {
                        "type": "heading",
                        "attrs": {"level": 2},
                        "content": [{"type": "text", "text": "Cells"}],
                    },
                    {
                        "type": "paragraph",
                        "content": [
                            {
                                "type": "text",
                                "text": text,
                                "marks": [{"type": "highlight", "attrs": {"color": "#fef08a"}}],
                            }
                        ],
                    },
                ],
            }
        ],
    }


def save(client, current, document, mutation_id=None):
    return client.put(
        "/api/v1/pills/pill/notes",
        json={
            "document": document,
            "baseRevisionId": current["revisionId"],
            "mutationId": mutation_id or str(uuid4()),
        },
    )


def test_baseline_autosave_grouping_noops_pagination_and_restore(notes_api, monkeypatch):
    client, database, _ = notes_api
    first = client.get("/api/v1/pills/pill/notes").json()
    assert first["kind"] == "generated"
    assert len(database.pill_note_revisions.documents) == 1
    assert client.get("/api/v1/pills/pill/notes").json()["revisionId"] == first["revisionId"]
    refs = list(first["references"])
    document = rich_document(citation_ids=refs)
    second_response = save(client, first, document)
    assert second_response.status_code == 200, second_response.text
    second = second_response.json()
    third = save(client, second, rich_document("More editing", refs)).json()
    assert third["groupId"] == second["groupId"]
    assert len(client.get("/api/v1/pills/pill/notes/versions").json()["items"]) == 2
    count = len(database.pill_note_revisions.documents)
    assert save(client, third, third["document"]).json()["revisionId"] == third["revisionId"]
    assert len(database.pill_note_revisions.documents) == count

    class Later(datetime):
        @classmethod
        def now(cls, tz=None):
            return datetime.now(UTC) + timedelta(minutes=6)

    monkeypatch.setattr(notes, "datetime", Later)
    fourth = save(client, third, rich_document("Six minutes later", refs)).json()
    assert fourth["groupId"] != third["groupId"]
    history = client.get("/api/v1/pills/pill/notes/versions?limit=1").json()
    assert history["items"][0]["revisionId"] == fourth["revisionId"]
    next_page = client.get(
        f"/api/v1/pills/pill/notes/versions?cursor={history['nextCursor']}"
    ).json()
    assert [item["revisionId"] for item in next_page["items"]] == [
        third["revisionId"],
        first["revisionId"],
    ]
    restore = client.post(
        f"/api/v1/pills/pill/notes/versions/{first['revisionId']}/restore",
        json={"baseRevisionId": fourth["revisionId"], "mutationId": str(uuid4())},
    )
    assert restore.status_code == 200
    assert restore.json()["kind"] == "restored"
    assert restore.json()["generated"] == first["generated"]
    assert len(client.get("/api/v1/pills/pill/notes/versions").json()["items"]) == 4


def test_conflicts_and_idempotent_retry_do_not_overwrite_current(notes_api):
    client, database, _ = notes_api
    baseline = client.get("/api/v1/pills/pill/notes").json()
    mutation = str(uuid4())
    document = rich_document()
    saved = save(client, baseline, document, mutation).json()
    retry = save(client, baseline, document, mutation)
    assert retry.status_code == 200
    assert retry.json()["revisionId"] == saved["revisionId"]
    assert save(client, baseline, rich_document("Other tab")).status_code == 409
    assert client.get("/api/v1/pills/pill/notes").json()["document"] == document
    assert len(database.pill_note_revisions.documents) == 2
    # A different operation cannot reuse a committed mutation ID.
    assert save(client, saved, rich_document("Changed retry"), mutation).status_code == 409
    # Superseded intermediate autosaves are not exposed as history versions.
    latest = save(client, saved, rich_document("Next")).json()
    assert client.get(f"/api/v1/pills/pill/notes/versions/{saved['revisionId']}").status_code == 404
    assert (
        client.get(f"/api/v1/pills/pill/notes/versions/{latest['revisionId']}").status_code == 200
    )


def test_ownership_and_processing_guards(notes_api):
    client, database, identity = notes_api
    baseline = client.get("/api/v1/pills/pill/notes").json()
    identity["user"] = "bob"
    for path in ("", "/versions", f"/versions/{baseline['revisionId']}"):
        assert client.get(f"/api/v1/pills/pill/notes{path}").status_code == 404
    assert save(client, baseline, rich_document()).status_code == 404
    identity["user"] = "alice"
    database.pills.documents["pill"]["status"] = "processing"
    assert save(client, baseline, rich_document()).status_code == 409
    assert (
        client.post(
            f"/api/v1/pills/pill/notes/versions/{baseline['revisionId']}/restore",
            json={"baseRevisionId": baseline["revisionId"], "mutationId": str(uuid4())},
        ).status_code
        == 409
    )
    assert client.get("/api/v1/pills/pill/notes").json()["revisionId"] == baseline["revisionId"]


@pytest.mark.parametrize(
    "malformation",
    ["reference", "visual", "html", "link", "color", "duplicate", "depth", "oversize"],
)
def test_document_validation(notes_api, malformation):
    client, _, _ = notes_api
    baseline = client.get("/api/v1/pills/pill/notes").json()
    document = rich_document()
    section = document["content"][0]
    text = section["content"][1]["content"][0]
    if malformation == "reference":
        section["attrs"]["citationIds"] = ["forged"]
    elif malformation == "visual":
        section["content"].append({"type": "noteVisual", "attrs": {"id": "forged"}})
    elif malformation == "html":
        section["content"].append({"type": "html", "text": "<script>alert(1)</script>"})
    elif malformation == "link":
        text["marks"] = [{"type": "link", "attrs": {"href": "javascript:alert(1)"}}]
    elif malformation == "color":
        text["marks"][0]["attrs"]["color"] = "red;position:fixed"
    elif malformation == "duplicate":
        document["content"].append(deepcopy(section))
    elif malformation == "depth":
        nested = {"type": "paragraph"}
        for _ in range(40):
            nested = {"type": "blockquote", "content": [nested]}
        section["content"].append(nested)
    else:
        text["text"] = "a" * 1_000_001
    assert save(client, baseline, document).status_code in {413, 422}


@pytest.mark.asyncio
async def test_export_uses_edited_document_and_preserves_extra_marks(notes_api):
    client, database, _ = notes_api
    baseline = client.get("/api/v1/pills/pill/notes").json()
    current = save(
        client, baseline, rich_document("Current note text", baseline["references"])
    ).json()
    pill = await notes.PillRepository(database).get("pill", "alice")
    snapshot = database.pill_note_revisions.documents[current["revisionId"]]
    archive = await build_export(pill, SimpleNamespace(get_bytes=AsyncMock()), snapshot)
    with ZipFile(BytesIO(archive)) as bundle:
        markdown = bundle.read("notes.md").decode()
    assert "Current note text</mark>" in markdown
    assert "background-color:#fef08a" in markdown
    assert "Cells contain a nucleus." not in markdown
    assert "Source: Lecture, p1" in markdown


@pytest.mark.asyncio
async def test_regeneration_publishes_new_notes_without_removing_edits(notes_api):
    client, database, _ = notes_api
    baseline = client.get("/api/v1/pills/pill/notes").json()
    saved = save(client, baseline, rich_document()).json()
    repository = notes.NotesRepository(database)
    pill = await notes.PillRepository(database).get("pill", "alice")
    previous = await repository.current(pill)
    database.pills.documents["pill"]["status"] = "processing"
    artifact = pill.artifact.model_copy(deep=True)
    artifact.summary = "Regenerated"
    generated = repository.snapshot(pill, notes.generated_content(artifact), previous, "generated")
    await repository.commit(
        pill, generated, pill.notes_revision_id, status="processing", changes={"status": "ready"}
    )
    assert client.get("/api/v1/pills/pill/notes").json()["generated"]["summary"] == "Regenerated"
    history = client.get("/api/v1/pills/pill/notes/versions").json()
    assert len(history["items"]) == 3
    assert history["items"][1]["revisionId"] == saved["revisionId"]


@pytest.mark.asyncio
async def test_retry_recovers_a_prepared_snapshot_after_interrupted_commit(notes_api):
    client, database, _ = notes_api
    baseline = client.get("/api/v1/pills/pill/notes").json()
    repository = notes.NotesRepository(database)
    pill = await notes.PillRepository(database).get("pill", "alice")
    previous = await repository.current(pill)
    mutation = str(uuid4())
    document = rich_document()
    snapshot = repository.snapshot(
        pill, {**previous, "document": document, "generated": None}, previous, "edited", mutation
    )
    await database.pill_note_revisions.insert_one(snapshot)
    retry = save(client, baseline, document, mutation)
    assert retry.status_code == 200
    assert retry.json()["revisionId"] == mutation


@pytest.mark.asyncio
async def test_failed_regeneration_keeps_existing_notes_readable_and_editable(
    notes_api, monkeypatch
):
    from src.services import pipeline

    client, database, _ = notes_api
    baseline = client.get("/api/v1/pills/pill/notes").json()
    current = save(client, baseline, rich_document()).json()
    monkeypatch.setattr(pipeline, "get_database", lambda: database)
    monkeypatch.setattr(pipeline, "get_storage", lambda: SimpleNamespace())
    monkeypatch.setattr(
        pipeline, "resolve_generation", AsyncMock(side_effect=RuntimeError("Provider offline"))
    )
    with pytest.raises(RuntimeError, match="Provider offline"):
        await pipeline.process_pill("pill")
    assert database.pills.documents["pill"]["status"] == "ready"
    assert client.get("/api/v1/pills/pill/notes").json()["revisionId"] == current["revisionId"]
    assert save(client, current, rich_document("After failure")).status_code == 200


def test_editor_table_defaults_code_and_links_are_valid_and_export_portably(notes_api):
    client, _, _ = notes_api
    baseline = client.get("/api/v1/pills/pill/notes").json()
    document = rich_document()
    body = document["content"][0]["content"]
    body.extend(
        [
            {
                "type": "table",
                "content": [
                    {
                        "type": "tableRow",
                        "content": [
                            {
                                "type": "tableHeader",
                                "attrs": {
                                    "colspan": 1,
                                    "rowspan": 1,
                                    "colwidth": None,
                                    "align": "center",
                                },
                                "content": [
                                    {
                                        "type": "paragraph",
                                        "content": [{"type": "text", "text": "Column"}],
                                    }
                                ],
                            },
                        ],
                    },
                    {
                        "type": "tableRow",
                        "content": [
                            {
                                "type": "tableCell",
                                "attrs": {
                                    "colspan": 1,
                                    "rowspan": 1,
                                    "colwidth": None,
                                    "align": None,
                                },
                                "content": [
                                    {
                                        "type": "paragraph",
                                        "content": [{"type": "text", "text": "Value"}],
                                    }
                                ],
                            },
                        ],
                    },
                ],
            },
            {
                "type": "codeBlock",
                "attrs": {"language": "c#"},
                "content": [{"type": "text", "text": "var x = 1;"}],
            },
            {
                "type": "paragraph",
                "content": [
                    {"type": "text", "text": "<value>", "marks": [{"type": "code"}]},
                    {
                        "type": "text",
                        "text": "Link",
                        "marks": [
                            {
                                "type": "link",
                                "attrs": {
                                    "href": "https://example.com/a(b)<c>",
                                    "target": "_blank",
                                    "rel": "noopener noreferrer nofollow",
                                    "class": None,
                                    "title": None,
                                },
                            }
                        ],
                    },
                    {"type": "hardBreak", "marks": [{"type": "bold"}]},
                ],
            },
        ]
    )
    assert save(client, baseline, document).status_code == 200
    markdown = notes.document_markdown(document)
    assert "| :---: |" in markdown
    assert "```c#\nvar x = 1;" in markdown
    assert "` <value> `" in markdown
    assert "a%28b%29%3Cc%3E" in markdown
