from noteesta_api.config import Settings
from noteesta_api.prompts import render_prompt
from noteesta_api.repository import _deserialize, _serialize
from noteesta_api.routes.pills import _is_youtube_url
from noteesta_api.schemas import Citation, Source, StudyPill, VisualNode, VisualSpec
from noteesta_api.services.extraction import ExtractedSegment, chunk_segments
from noteesta_api.services.pipeline import _note_sections
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
