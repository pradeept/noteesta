from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from noteesta_api.repository import PillRepository, _serialize
from noteesta_api.routes.pills import get_three_d_artifact
from noteesta_api.schemas import Source, StudyArtifact, StudyPill, ThreeDMetadata
from noteesta_api.services.three_d import prepare_three_d, validate_scene_code


class FakeOrchestrator:
    def __init__(self, response: dict):
        self.response = response

    async def generate_three_d_handoff(self, *, grounded_notes: str) -> dict:
        assert grounded_notes
        return self.response


def source() -> Source:
    return Source(id="lecture", name="Biology lecture", kind="document", detail="1 page")


@pytest.mark.asyncio
async def test_unsuitable_handoff_does_not_call_openai(monkeypatch: pytest.MonkeyPatch) -> None:
    async def unexpected(_: dict) -> str:
        raise AssertionError("OpenAI should not be called")

    monkeypatch.setattr("noteesta_api.services.three_d.generate_scene_code", unexpected)
    metadata, code, handoff = await prepare_three_d(
        FakeOrchestrator(
            {"suitable": False, "reason": "No spatial structure in the sources."}
        ),
        "grounded notes",
        {"lecture": source()},
    )
    assert metadata.status == "unavailable"
    assert metadata.reason == "No spatial structure in the sources."
    assert code is None and handoff is None


@pytest.mark.asyncio
async def test_handoff_requires_source_evidence_before_openai(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def unexpected(_: dict) -> str:
        raise AssertionError("OpenAI should not be called")

    monkeypatch.setattr("noteesta_api.services.three_d.generate_scene_code", unexpected)
    raw = {
        "suitable": True,
        "title": "Amoeba",
        "description": "Schematic structure",
        "parts": [
            {"name": "Cell", "appearance": "schematic blob", "relationship": "outer part"},
            {"name": "Nucleus", "appearance": "sphere", "relationship": "inside cell"},
        ],
        "evidence": [{"sourceId": "unselected", "locator": "page 1", "excerpt": "nucleus"}],
    }
    with pytest.raises(ValueError, match="selected-source evidence"):
        await prepare_three_d(FakeOrchestrator(raw), "grounded notes", {"lecture": source()})


@pytest.mark.asyncio
async def test_suitable_handoff_sends_only_cited_brief(monkeypatch: pytest.MonkeyPatch) -> None:
    received = {}

    async def fake_generate(brief: dict) -> str:
        received.update(brief)
        return "function buildArtifact(THREE, scene) { scene.add(new THREE.Group()); }"

    monkeypatch.setattr("noteesta_api.services.three_d.generate_scene_code", fake_generate)
    raw = {
        "suitable": True,
        "title": "Chloroplast",
        "description": "Schematic thylakoid stacks in stroma",
        "parts": [
            {"name": "Thylakoids", "appearance": "stacked discs", "relationship": "in stroma"},
            {"name": "Stroma", "appearance": "open space", "relationship": "around thylakoids"},
        ],
        "evidence": [
            {"sourceId": "lecture", "locator": "page 1", "excerpt": "stacks in the stroma"}
        ],
    }
    metadata, code, handoff = await prepare_three_d(
        FakeOrchestrator(raw), "grounded notes", {"lecture": source()}
    )
    assert metadata.status == "ready"
    assert metadata.citations[0].source_id == "lecture"
    assert code and handoff == received
    assert "grounded notes" not in str(received)


def test_scene_code_rejects_unsafe_or_unbounded_output() -> None:
    valid = "function buildArtifact(THREE, scene) { scene.add(new THREE.Group()); }"
    assert validate_scene_code(valid) == valid
    for code in (valid + " fetch('/secret')", valid + "</script>", "hello", valid * 1100):
        with pytest.raises(ValueError):
            validate_scene_code(code)


class FakePills:
    def __init__(self, document: dict):
        self.document = document

    async def find_one(self, query: dict) -> dict | None:
        if query["_id"] != self.document["_id"]:
            return None
        if query.get("user_id", self.document["user_id"]) != self.document["user_id"]:
            return None
        return self.document


class FakeThreeD:
    def __init__(self):
        self.document = None

    async def replace_one(self, query: dict, document: dict, *, upsert: bool) -> None:
        assert upsert and query["_id"] == document["_id"]
        self.document = document

    async def find_one(self, query: dict, projection: dict) -> dict | None:
        assert projection == {"javascript": 1, "version": 1}
        if self.document and all(self.document.get(key) == value for key, value in query.items()):
            return self.document
        return None


@pytest.mark.asyncio
async def test_saved_scene_is_retrievable_only_by_its_owner() -> None:
    pill = StudyPill(
        id="pill-1",
        user_id="student-1",
        title="Cells",
        subject="Biology",
        status="ready",
        artifact=StudyArtifact(
            summary="Cells",
            sections=[],
            three_d=ThreeDMetadata(status="ready", title="Amoeba"),
        ),
    )
    database = SimpleNamespace(pills=FakePills(_serialize(pill)), pill_three_d=FakeThreeD())
    repository = PillRepository(database)
    await repository.save_three_d(pill, "function buildArtifact(THREE, scene) {}", {}, "gpt-5.4")

    result = await get_three_d_artifact("pill-1", "student-1", database)
    assert result.javascript.startswith("function buildArtifact")
    assert result.version == 1
    with pytest.raises(HTTPException) as error:
        await get_three_d_artifact("pill-1", "student-2", database)
    assert error.value.status_code == 404
