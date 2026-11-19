import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, Mock

import pytest
import yt_dlp
from fakes import FakeTable

from src.common.schemas.schemas import Source
from src.config import Settings
from src.llm import CHAT_SCHEMA, NOTES_SCHEMA, SECTION_SCHEMA
from src.models.schemas import GenerationSelection
from src.pills.schemas import StudyPill
from src.repository import _serialize
from src.services import chat, extraction, pipeline
from src.services.extraction import TranscriptCue, chunk_segments, extract_source

REGULAR = """WEBVTT

18
01:00:01.125 --> 01:00:03.500 align:start
The nucleus &amp; its membrane.
"""
AUTOMATIC = """WEBVTT
Kind: captions
Language: en

00:00:01.000 --> 00:00:03.000
Start with the nucleus.

00:00:03.000 --> 00:00:05.000
Start with the nucleus.
Then<00:00:03.300><c> draw the membrane.</c>

00:00:05.000 --> 00:00:05.010
Then draw the membrane.

00:00:05.010 --> 00:00:06.000
Again.

00:00:06.000 --> 00:00:07.000
Again.
"""


@pytest.mark.asyncio
@pytest.mark.parametrize("regular_contents", [REGULAR, "WEBVTT\n\n", None])
async def test_caption_selection_records_first_usable_track(monkeypatch, regular_contents):
    source = Source(
        id="youtube",
        name="Lesson",
        kind="youtube",
        detail="YouTube captions",
        url="https://youtu.be/83iyz_5rN8c",
    )
    downloader = Mock()
    downloader.extract_info.return_value = {
        "id": "83iyz_5rN8c",
        "subtitles": {"en-GB": [{"ext": "vtt", "url": "https://example.test/regular"}]},
        "automatic_captions": {"en": [{"ext": "vtt", "url": "https://example.test/automatic"}]},
    }
    downloads = []

    def download(path, payload, *, subtitle):
        assert subtitle is True
        kind = payload["url"].rsplit("/", 1)[-1]
        downloads.append(kind)
        contents = regular_contents if kind == "regular" else AUTOMATIC
        if contents is None:
            raise yt_dlp.utils.DownloadError("could not read regular track")
        Path(path).write_text(contents, encoding="utf-8")
        return True, True

    downloader.dl.side_effect = download
    context = MagicMock()
    context.__enter__.return_value = downloader
    factory = Mock(return_value=context)
    monkeypatch.setattr(yt_dlp, "YoutubeDL", factory)

    result = await extract_source(source, Mock())

    assert factory.call_args.args[0]["skip_download"] is True
    downloader.extract_info.assert_called_once_with(
        "https://www.youtube.com/watch?v=83iyz_5rN8c", download=False
    )
    if regular_contents == REGULAR:
        assert downloads == ["regular"]
        assert result.caption_track_kind == result.canonical["caption_track_kind"] == "standard"
        assert result.canonical["segments"] == [
            {"start": 3601.125, "end": 3603.5, "text": "The nucleus & its membrane."}
        ]
        assert result.segments[0].locator == "01:00:01.125–01:00:03.500"
    else:
        assert downloads == ["regular", "automatic"]
        assert result.caption_track_kind == result.canonical["caption_track_kind"] == "ASR"
        assert result.canonical["segments"] == [
            {"start": 1.0, "end": 3.0, "text": "Start with the nucleus."},
            {"start": 3.0, "end": 5.0, "text": "Then draw the membrane."},
            {"start": 5.01, "end": 6.0, "text": "Again."},
            {"start": 6.0, "end": 7.0, "text": "Again."},
        ]


@pytest.mark.asyncio
async def test_missing_english_captions_suggests_upload(monkeypatch):
    downloader = Mock()
    downloader.extract_info.return_value = {"subtitles": {"fr": []}}
    context = MagicMock()
    context.__enter__.return_value = downloader
    monkeypatch.setattr(yt_dlp, "YoutubeDL", Mock(return_value=context))
    source = Source(
        id="youtube",
        name="Lesson",
        kind="youtube",
        detail="YouTube captions",
        url="https://youtu.be/83iyz_5rN8c",
    )

    with pytest.raises(RuntimeError, match="No accessible English captions.*Upload"):
        await extract_source(source, Mock())
    downloader.dl.assert_not_called()


def test_transcript_grouping_keeps_full_text_and_exact_cue_ranges(monkeypatch):
    monkeypatch.setattr(
        extraction,
        "get_settings",
        lambda: Settings(_env_file=None, chunk_size=80, chunk_overlap=20),
    )
    cues = [TranscriptCue(i * 2, i * 2 + 1.5, f"Evidence {i:04d}") for i in range(1900)]
    segments = [extraction._transcript_segment([cue]) for cue in cues]

    chunks = chunk_segments(segments)

    assert len(chunks) < len(segments) / 3
    assert {cue.text for chunk in chunks for cue in chunk.cues} == {cue.text for cue in cues}
    assert all(len(chunk.text) <= 80 for chunk in chunks)
    assert all(chunk.cues[-1].end - chunk.cues[0].start <= 60 for chunk in chunks)
    assert chunks[0].cues[-1] == chunks[1].cues[0]
    for cue in (cues[0], cues[len(cues) // 2], cues[-1]):
        matching = next(chunk for chunk in chunks if cue.text in chunk.text)
        assert f"[{cue.locator}] {cue.text}" in matching.analysis_text
        assert cue.locator not in matching.text


def test_long_pause_keeps_chunks_separate_and_oversized_cues_keep_their_range(monkeypatch):
    monkeypatch.setattr(
        extraction, "get_settings", lambda: Settings(_env_file=None, chunk_size=10, chunk_overlap=0)
    )
    cues = [TranscriptCue(1, 2, "intro"), TranscriptCue(80, 85, "one two three four")]
    chunks = chunk_segments([extraction._transcript_segment([cue]) for cue in cues])

    assert [chunk.text for chunk in chunks] == ["intro", "one two", "three four"]
    assert [chunk.locator for chunk in chunks] == [
        cues[0].locator,
        cues[1].locator,
        cues[1].locator,
    ]


@pytest.mark.asyncio
async def test_media_downloads_to_a_temporary_path_for_whisper(monkeypatch):
    paths = []

    async def download(key, path):
        assert key == "original.mp4"
        path.write_bytes(b"recording")
        paths.append(path)

    def transcribe(filename, *, vad_filter):
        assert vad_filter is True
        assert Path(filename).read_bytes() == b"recording"
        return [SimpleNamespace(start=4.25, end=8.0, text=" Spoken text. ")], SimpleNamespace(
            language="en"
        )

    storage = SimpleNamespace(download_file=AsyncMock(side_effect=download), get_bytes=AsyncMock())
    model = SimpleNamespace(transcribe=Mock(side_effect=transcribe))
    monkeypatch.setattr(extraction, "_whisper_model", Mock(return_value=model))
    source = Source(
        id="video", name="lecture.mp4", kind="video", detail="Video", object_key="original.mp4"
    )

    result = await extract_source(source, storage)

    assert result.canonical["segments"] == [{"start": 4.25, "end": 8.0, "text": "Spoken text."}]
    assert result.segments[0].locator == "00:04.250–00:08"
    assert not paths[0].exists()
    storage.get_bytes.assert_not_awaited()


@pytest.mark.asyncio
async def test_worker_preserves_cue_timeline_in_notes_and_indexes_full_transcript(monkeypatch):
    facts = [
        TranscriptCue(2, 5, "First: cells use energy."),
        TranscriptCue(1200, 1204, "Middle: membranes are selectively permeable."),
        TranscriptCue(3604, 3609, "Last: mitosis divides the nucleus."),
    ]
    cues = [
        cue for fact in facts for cue in (fact, TranscriptCue(fact.end, fact.end + 3, "Review."))
    ]
    source = Source(id="youtube", name="Lesson", kind="youtube", detail="YouTube captions")
    pill = StudyPill(
        id="lecture",
        user_id="student",
        title="Biology lecture",
        subject="Biology",
        sources=[source],
        selected_materials=["notes"],
    )
    db = SimpleNamespace(
        pills=FakeTable([_serialize(pill)]),
        pill_note_revisions=FakeTable(),
        pill_three_d=FakeTable(),
    )
    storage = SimpleNamespace(put_bytes=AsyncMock())
    retriever = SimpleNamespace(index=AsyncMock(), retrieve=AsyncMock())
    generation = GenerationSelection(provider="ollama", model="local")

    async def generate(prompt, schema, **_):
        if schema is SECTION_SCHEMA:
            fact = next(fact for fact in facts if fact.text in prompt)
            assert f"[{fact.locator}] {fact.text}" in prompt
            return {"claims": [{"text": fact.text, "locator": fact.locator, "excerpt": fact.text}]}
        if schema is NOTES_SCHEMA:
            analyses = json.loads(prompt.split("<analyses>\n")[1].split("\n</analyses>")[0])
            assert [analysis["claims"][0]["locator"] for analysis in analyses] == [
                fact.locator for fact in facts
            ]
            return {
                "summary": "Cells",
                "sections": [
                    {
                        "id": f"topic-{index}",
                        "title": f"Topic {index}",
                        "markdown": analysis["claims"][0]["text"],
                        "evidence": [{"sourceId": source.id, **analysis["claims"][0]}],
                    }
                    for index, analysis in enumerate(analyses)
                ],
            }
        if schema is CHAT_SCHEMA:
            match = retriever.retrieve.return_value[0]
            assert match.page_content in prompt
            return {
                "answer": match.page_content,
                "grounded": True,
                "evidence": [{"sourceId": source.id, "locator": match.metadata["locator"]}],
            }
        raise RuntimeError("Optional visual skipped for this fixture")

    resolve = AsyncMock(return_value=(generation, SimpleNamespace(generate_json=generate)))
    monkeypatch.setattr(pipeline, "resolve_generation", resolve)
    monkeypatch.setattr(chat, "resolve_generation", resolve)
    monkeypatch.setattr(pipeline, "get_database", lambda: db)
    monkeypatch.setattr(pipeline, "get_storage", lambda: storage)
    monkeypatch.setattr(pipeline, "StudyPillRetriever", lambda _: retriever)
    monkeypatch.setattr(chat, "StudyPillRetriever", lambda _: retriever)
    monkeypatch.setattr(
        pipeline,
        "extract_source",
        AsyncMock(
            return_value=extraction.ExtractedSource(
                canonical={"type": "youtube-captions"},
                segments=[extraction._transcript_segment([cue]) for cue in cues],
                caption_track_kind="ASR",
            )
        ),
    )

    await pipeline.process_pill(pill.id)

    stored = db.pills.documents[pill.id]
    assert stored["status"] == "ready"
    assert stored["sources"][0]["caption_track_kind"] == "ASR"
    assert [section["citations"][0]["locator"] for section in stored["artifact"]["sections"]] == [
        fact.locator for fact in facts
    ]
    indexed = retriever.index.call_args.kwargs
    assert (indexed["user_id"], indexed["pill_id"]) == (pill.user_id, pill.id)
    for fact in facts:
        match = next(
            document for document in indexed["documents"] if fact.text in document.page_content
        )
        assert match.page_content == f"{fact.text} Review."
        retriever.retrieve.return_value = [match]
        answer = await chat.answer_question(
            db, pill_id=pill.id, user_id=pill.user_id, question=fact.text, generation=generation
        )
        assert answer.grounded
        assert answer.citations[0].locator == match.metadata["locator"]
