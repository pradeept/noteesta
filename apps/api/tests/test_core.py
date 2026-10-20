from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from noteesta_api.config import Settings
from noteesta_api.prompts import render_prompt
from noteesta_api.repository import _deserialize, _serialize
from noteesta_api.routes.pills import _is_youtube_url, update_study_pill
from noteesta_api.schemas import (
    Citation,
    Source,
    StudyPill,
    StudyPillUpdate,
    VisualNode,
    VisualSpec,
)
from noteesta_api.services.extraction import ExtractedSegment, chunk_segments
from noteesta_api.services.orchestration import StudyPillOrchestrator
from noteesta_api.services.pipeline import _mcq_target, _mcqs, _merge_mcqs, _note_sections
from noteesta_api.services.rendering import render_visual


def test_settings_accept_comma_separated_cors_origins() -> None:
    settings = Settings(
        _env_file=None,
        cors_origins="http://localhost:3000,https://noteesta.example",
    )

    assert settings.cors_origins == [
        "http://localhost:3000",
        "https://noteesta.example",
    ]


def test_youtube_url_validation_rejects_unrelated_hosts() -> None:
    assert _is_youtube_url("https://www.youtube.com/watch?v=lesson")
    assert _is_youtube_url("https://youtube.com/shorts/83iyz_5rN8c")
    assert _is_youtube_url("https://youtu.be/lesson")
    assert not _is_youtube_url("https://example.com/watch?v=lesson")
    assert not _is_youtube_url("file:///private/lesson.mp4")


def test_internal_fields_survive_repository_round_trip() -> None:
    pill = StudyPill(
        id="pill-1",
        user_id="student-1",
        title="Cell biology",
        subject="Biology",
        settings={"detail_level": "balanced"},
        sources=[
            Source(
                id="source-1",
                name="lecture.txt",
                kind="document",
                detail="1 KB",
                object_key="users/student-1/source.txt",
            )
        ],
    )

    document = _serialize(pill)
    restored = _deserialize(document)

    assert document["user_id"] == "student-1"
    assert document["sources"][0]["object_key"] == "users/student-1/source.txt"
    assert restored.user_id == pill.user_id
    assert restored.sources[0].object_key == pill.sources[0].object_key


def test_legacy_pill_document_gets_defaults_for_new_library_fields() -> None:
    pill = _deserialize(
        {
            "_id": "pill-old",
            "user_id": "student-1",
            "title": "Existing notes",
            "subject": "Biology",
            "sources": [
                {
                    "id": "youtube-source",
                    "name": "YouTube lesson",
                    "kind": "youtube",
                    "detail": "YouTube captions",
                    "url": "https://youtube.com/shorts/lesson",
                }
            ],
        }
    )

    assert pill.description is None
    assert pill.tags == []
    assert pill.collection_id is None
    assert pill.processing_duration_seconds is None
    assert pill.sources[0].original_available is False


class FakePillCollection:
    def __init__(self, document: dict):
        self.document = document

    async def find_one(self, query: dict):
        if query.get("_id") != self.document["_id"]:
            return None
        if query.get("user_id") not in (None, self.document["user_id"]):
            return None
        return dict(self.document)

    async def update_one(self, query: dict, update: dict):
        if await self.find_one(query) is None:
            return SimpleNamespace(matched_count=0)
        self.document.update(update["$set"])
        return SimpleNamespace(matched_count=1)


class FakeCollectionCollection:
    async def find_one(self, query: dict):
        return None


@pytest.mark.asyncio
async def test_pill_metadata_update_is_user_scoped_and_normalizes_tags() -> None:
    database = SimpleNamespace(
        pills=FakePillCollection(
            {"_id": "pill-1", "user_id": "student-1", "title": "Old title", "subject": "Biology"}
        ),
        collections=FakeCollectionCollection(),
    )

    updated = await update_study_pill(
        "pill-1",
        StudyPillUpdate(
            title="  New title  ",
            description="  Brief context  ",
            tags=[" Cells ", "cells", "Revision"],
        ),
        "student-1",
        database,
    )

    assert updated.title == "New title"
    assert updated.description == "Brief context"
    assert updated.tags == ["Cells", "Revision"]

    with pytest.raises(HTTPException) as error:
        await update_study_pill(
            "pill-1", StudyPillUpdate(title="Other user"), "student-2", database
        )
    assert error.value.status_code == 404


def test_chunks_cover_long_text_with_overlap() -> None:
    text = " ".join(f"sentence-{index}." for index in range(600))
    chunks = chunk_segments([ExtractedSegment(locator="page 1", text=text)])

    assert len(chunks) > 1
    assert all(chunk.locator == "page 1" for chunk in chunks)
    assert chunks[0].text.startswith("sentence-0")
    assert chunks[-1].text.endswith("sentence-599.")


def test_visual_renderer_returns_png() -> None:
    visual = VisualSpec(
        id="visual-1",
        title="Energy flow",
        description="Energy moves between two stages.",
        kind="flow",
        nodes=[
            VisualNode(id="first", label="Light reactions", detail="Thylakoid"),
            VisualNode(id="second", label="Calvin cycle", detail="Stroma"),
        ],
        edges=[{"from": "first", "to": "second", "label": "ATP"}],
        citations=[
            Citation(
                source_id="source-1",
                source_name="Lecture",
                locator="01:00",
                excerpt="Energy moves between two stages.",
            )
        ],
    )

    output = render_visual(visual)

    assert output.startswith(b"\x89PNG\r\n\x1a\n")


def test_prompt_renderer_uses_shared_prompt_file() -> None:
    output = render_prompt(
        "grounded-chat",
        question="What happens?",
        retrieved_context="One source",
    )

    assert "QUESTION: What happens?" in output
    assert "One source" in output
    assert "{{question}}" not in output


def test_note_sections_infer_missing_title_and_id_from_markdown() -> None:
    source = Source(id="source-1", name="lesson.png", kind="image", detail="1 page")

    sections = _note_sections(
        [
            {
                "markdown": "## Light reactions\n\nThey produce ATP and NADPH.",
                "evidence": [
                    {
                        "sourceId": source.id,
                        "locator": "page 1",
                        "excerpt": "ATP and NADPH are produced.",
                    }
                ],
            }
        ],
        {source.id: source},
        "pill-1",
    )

    assert sections[0].id == "light-reactions"
    assert sections[0].title == "Light reactions"
    assert sections[0].citations[0].source_name == "lesson.png"


def test_mcq_count_responds_to_note_depth_and_discards_duplicates() -> None:
    source = Source(id="source-1", name="lesson.png", kind="image", detail="1 page")
    evidence = [{"sourceId": source.id, "locator": "page 1", "excerpt": "supported"}]
    row = {
        "question": "What forms after cleavage?",
        "choices": ["Morula", "Neuron", "Placenta"],
        "correctIndex": 0,
        "explanation": "Cleavage produces a morula.",
        "evidence": evidence,
    }

    assert _mcq_target({"sections": [{"markdown": "A brief note."}]}) == 2
    assert _mcq_target({"sections": [{"markdown": "One"}] * 3}) == 5
    assert _mcq_target({"sections": [{"markdown": "word " * 180}]}) == 5
    repeated = _mcqs([row, {**row, "question": "what forms after cleavage?"}], {source.id: source})
    assert len(repeated) == 1
    merged = _merge_mcqs(
        _mcqs([row], {source.id: source}),
        [row, {**row, "question": "Where does implantation occur?"}],
        {source.id: source},
    )
    assert [question.id for question in merged] == ["mcq-1", "mcq-2"]
    assert not _mcqs([{**row, "evidence": []}], {source.id: source})


@pytest.mark.asyncio
async def test_materials_job_requests_mcq_minimum_in_prompt_and_schema() -> None:
    class FakeLlm:
        async def generate_json(self, prompt, schema, *, num_predict):
            assert "MCQ_TARGET: 5" in prompt
            assert "EXISTING_MCQS: []" in prompt
            assert schema["properties"]["mcqs"]["minItems"] == 5
            assert num_predict >= 5000
            return {"mcqs": []}

    result = await StudyPillOrchestrator(FakeLlm()).generate_materials(
        requested_materials='["mcqs"]',
        study_context="{}",
        grounded_notes="{}",
        mcq_target=5,
    )
    assert result == {"mcqs": []}
