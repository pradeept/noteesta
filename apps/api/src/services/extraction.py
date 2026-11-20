from __future__ import annotations

import asyncio
import json
import logging
import re
import shutil
import tempfile
from collections.abc import Iterable
from dataclasses import asdict, dataclass
from datetime import datetime
from functools import lru_cache
from html import unescape
from pathlib import Path
from typing import TYPE_CHECKING, Any

from botocore.exceptions import ClientError
from langchain_text_splitters import RecursiveCharacterTextSplitter

from src.common.schemas.schemas import CaptionTrackKind, Source
from src.config import get_settings
from src.services.web_sources import WebImportError, extract_page, fetch_page
from src.services.youtube import youtube_video_url
from src.storage import ObjectStorage

if TYPE_CHECKING:
    from faster_whisper import WhisperModel

logger = logging.getLogger(__name__)
TRANSCRIPT_CHUNK_SECONDS = 60
CAPTION_LANGUAGES = ("en", "en-US", "en-GB")
NO_CAPTIONS = (
    "No accessible English captions were found for this YouTube video. "
    "Upload an audio or video recording to transcribe it instead."
)
VTT_TIME = r"(?:\d{2,}:)?\d{2}:\d{2}\.\d{3}"
VTT_CUE = re.compile(rf"^({VTT_TIME})\s+-->\s+({VTT_TIME})(?:\s|$)")
VTT_INLINE_TIME = re.compile(rf"<{VTT_TIME}>")


@dataclass(frozen=True)
class TranscriptCue:
    start: float
    end: float
    text: str

    @property
    def locator(self) -> str:
        return f"{_timestamp(self.start)}–{_timestamp(self.end)}"


@dataclass
class ExtractedSegment:
    locator: str
    text: str
    cues: tuple[TranscriptCue, ...] = ()
    preserve_formatting: bool = False

    @property
    def analysis_text(self) -> str:
        if self.cues:
            return "\n".join(f"[{cue.locator}] {cue.text}" for cue in self.cues)
        return self.text


@dataclass
class ExtractedSource:
    canonical: dict[str, Any]
    segments: list[ExtractedSegment]
    caption_track_kind: CaptionTrackKind | None = None


async def extract_source(source: Source, storage: ObjectStorage) -> ExtractedSource:
    """Extract a source into canonical data and provenance-preserving text segments."""
    if source.kind == "youtube":
        return await asyncio.to_thread(_extract_youtube, source)
    if source.kind == "website":
        if source.snapshot_key:
            try:
                canonical = json.loads(await storage.get_bytes(source.snapshot_key))
            except ClientError as error:
                if error.response["Error"]["Code"] not in {"NoSuchKey", "404", "NotFound"}:
                    raise
                raise WebImportError(
                    "The saved page text is missing. Add this URL to a new Pill to import it again."
                ) from error
            except (ValueError, UnicodeError) as error:
                raise WebImportError("The saved page text could not be read.") from error
        else:
            if not source.url:
                raise WebImportError("This website source is missing its URL.")
            page = await fetch_page(source.url)
            canonical = await asyncio.to_thread(extract_page, page)
        if (
            not isinstance(canonical, dict)
            or canonical.get("type") != "website"
            or canonical.get("version") != 1
            or not isinstance(canonical.get("segments"), list)
            or not canonical["segments"]
            or any(
                not isinstance(canonical.get(key), str) or not canonical[key]
                for key in ("title", "url", "fetched_at")
            )
            or any(
                not isinstance(segment, dict)
                or any(
                    not isinstance(segment.get(key), str) or not segment[key]
                    for key in ("locator", "text")
                )
                for segment in canonical["segments"]
            )
        ):
            raise WebImportError("The saved page text has an unsupported format.")
        try:
            datetime.fromisoformat(canonical["fetched_at"])
        except ValueError as error:
            raise WebImportError("The saved page import date could not be read.") from error
        return ExtractedSource(
            canonical=canonical,
            segments=[
                ExtractedSegment(
                    locator=segment["locator"], text=segment["text"], preserve_formatting=True
                )
                for segment in canonical["segments"]
            ],
        )
    if not source.object_key:
        raise ValueError(f"Source {source.name} has no stored object")
    suffix = Path(source.name).suffix.lower()
    if source.kind in {"audio", "video"}:
        with tempfile.TemporaryDirectory(prefix="noteesta-media-") as directory:
            path = Path(directory) / f"source{suffix}"
            await storage.download_file(source.object_key, path)
            return _transcribe_media(path)

    content = await storage.get_bytes(source.object_key)
    if suffix in {".txt", ".md", ".csv"}:
        text = content.decode("utf-8", errors="replace")
        return ExtractedSource(
            canonical={"type": "plain-text", "text": text},
            segments=[ExtractedSegment(locator="document", text=text)],
        )
    return _parse_with_docling(content, suffix or ".bin")


def chunk_segments(segments: list[ExtractedSegment]) -> list[ExtractedSegment]:
    """Split each source segment with LangChain while retaining its source locator."""

    settings = get_settings()
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=settings.chunk_size,
        chunk_overlap=settings.chunk_overlap,
        length_function=len,
    )
    if segments and segments[0].cues:
        cues = (cue for segment in segments for cue in segment.cues)
        return _chunk_transcript(cues, splitter, settings.chunk_size, settings.chunk_overlap)

    chunks: list[ExtractedSegment] = []
    for segment in segments:
        text = (
            segment.text.strip()
            if segment.preserve_formatting
            else re.sub(r"\s+", " ", segment.text).strip()
        )
        if not text:
            continue
        chunks.extend(
            ExtractedSegment(
                locator=segment.locator,
                text=chunk,
                preserve_formatting=segment.preserve_formatting,
            )
            for chunk in splitter.split_text(text)
            if chunk.strip()
        )
    return chunks


def _chunk_transcript(
    cues: Iterable[TranscriptCue], splitter: RecursiveCharacterTextSplitter, size: int, overlap: int
) -> list[ExtractedSegment]:
    """Group adjacent cues and carry forward whole cues when the next chunk has room."""
    chunks: list[ExtractedSegment] = []
    group: list[TranscriptCue] = []
    length = 0
    end = 0.0
    for cue in cues:
        for text in splitter.split_text(" ".join(cue.text.split())):
            part = TranscriptCue(cue.start, cue.end, text)
            if group and (
                length + 1 + len(text) > size
                or max(end, part.end) - group[0].start > TRANSCRIPT_CHUNK_SECONDS
            ):
                chunks.append(_transcript_segment(group))
                tail: list[TranscriptCue] = []
                length = 0
                end = part.end
                for previous in reversed(group):
                    carry_length = length + len(previous.text) + (1 if tail else 0)
                    carry_end = max(end, previous.end)
                    if (
                        carry_length > overlap
                        or carry_length + 1 + len(text) > size
                        or carry_end - previous.start > TRANSCRIPT_CHUNK_SECONDS
                    ):
                        break
                    tail.append(previous)
                    length = carry_length
                    end = carry_end
                group = list(reversed(tail))
            length += len(text) + (1 if group else 0)
            group.append(part)
            end = max(end, part.end)
    if group:
        chunks.append(_transcript_segment(group))
    return chunks


def _transcript_segment(cues: list[TranscriptCue]) -> ExtractedSegment:
    locator = f"{_timestamp(cues[0].start)}–{_timestamp(max(cue.end for cue in cues))}"
    return ExtractedSegment(locator, " ".join(cue.text for cue in cues), tuple(cues))


def _parse_with_docling(content: bytes, suffix: str) -> ExtractedSource:
    """Parse a document with Docling and retain its JSON as the canonical record."""
    try:
        from docling.datamodel.accelerator_options import (
            AcceleratorDevice,
            AcceleratorOptions,
        )
        from docling.datamodel.base_models import InputFormat
        from docling.datamodel.pipeline_options import PdfPipelineOptions, RapidOcrOptions
        from docling.document_converter import DocumentConverter, ImageFormatOption, PdfFormatOption
    except ImportError as error:
        raise RuntimeError("Document and image parsing requires `uv sync` in api/.") from error

    pipeline_options = PdfPipelineOptions(
        do_ocr=True,
        ocr_options=RapidOcrOptions(backend="onnxruntime"),
        accelerator_options=AcceleratorOptions(
            device=AcceleratorDevice.CPU,
            num_threads=4,
        ),
    )
    converter = DocumentConverter(
        format_options={
            InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options),
            InputFormat.IMAGE: ImageFormatOption(pipeline_options=pipeline_options),
        }
    )

    with tempfile.TemporaryDirectory(prefix="noteesta-doc-") as directory:
        path = Path(directory) / f"source{suffix}"
        path.write_bytes(content)
        result = converter.convert(path)
        canonical = result.document.export_to_dict()
        markdown = result.document.export_to_markdown()

    # Docling JSON remains the canonical artifact. The Markdown view is split for generation.
    sections = [
        section.strip()
        for section in re.split(r"(?=^#{1,3}\s)", markdown, flags=re.M)
        if section.strip()
    ]
    return ExtractedSource(
        canonical=canonical,
        segments=[
            ExtractedSegment(locator=f"section {index + 1}", text=section)
            for index, section in enumerate(sections or [markdown])
        ],
    )


@lru_cache(maxsize=1)
def _whisper_model(model: str, device: str) -> WhisperModel:
    try:
        from faster_whisper import WhisperModel
    except ImportError as error:
        raise RuntimeError("Audio and video transcription requires `uv sync` in api/.") from error
    return WhisperModel(model, device=device)


def _transcribe_media(path: Path) -> ExtractedSource:
    """Transcribe the local recording and preserve its original cue times."""
    settings = get_settings()
    model = _whisper_model(settings.whisper_model, settings.whisper_device)
    segments, info = model.transcribe(str(path), vad_filter=True)
    cues = [
        TranscriptCue(segment.start, segment.end, segment.text.strip())
        for segment in segments
        if segment.text.strip()
    ]
    return ExtractedSource(
        canonical={
            "type": "whisper-transcript",
            "language": info.language,
            "segments": [asdict(cue) for cue in cues],
        },
        segments=[_transcript_segment([cue]) for cue in cues],
    )


def _extract_youtube(source: Source) -> ExtractedSource:
    """Fetch permitted YouTube captions and preserve caption timestamps."""
    try:
        import yt_dlp
        from yt_dlp.networking.exceptions import RequestError
        from yt_dlp.utils import DownloadError, ExtractorError
    except ImportError as error:
        raise RuntimeError("YouTube captions require `uv sync` in api/.") from error
    if not source.url:
        raise ValueError("YouTube source is missing its URL")

    url = youtube_video_url(source.url, saved_source=True)
    options = {
        "skip_download": True,
        "noplaylist": True,
        "ignore_no_formats_error": True,
        "socket_timeout": 15,
        "retries": 1,
        "nopart": True,
        "quiet": True,
    }
    if shutil.which("node"):
        options["js_runtimes"] = {"node": {}, "deno": {}}
    with (
        tempfile.TemporaryDirectory(prefix="noteesta-youtube-") as directory,
        yt_dlp.YoutubeDL(options) as downloader,
    ):
        try:
            info = downloader.extract_info(url, download=False)
        except DownloadError as error:
            raise RuntimeError(
                "Could not open this YouTube video to read its captions. "
                "Check the link or upload a recording instead."
            ) from error
        if not info or info.get("_type", "video") != "video":
            raise RuntimeError("Enter a link to a single YouTube video.")
        if info.get("live_status") in {"is_live", "is_upcoming", "post_live"}:
            raise RuntimeError("Use a YouTube video that has finished processing.")

        attempted_urls: set[str] = set()
        for collection, kind in (("subtitles", "standard"), ("automatic_captions", "ASR")):
            tracks = info.get(collection) or {}
            for language in CAPTION_LANGUAGES:
                candidates = [
                    *reversed(tracks.get(f"{language}-orig") or []),
                    *reversed(tracks.get(language) or []),
                ]
                for track in candidates:
                    track_url = track.get("url")
                    if track.get("ext") != "vtt" or not track_url or track_url in attempted_urls:
                        continue
                    attempted_urls.add(track_url)
                    path = Path(directory) / "captions.vtt"
                    path.unlink(missing_ok=True)
                    try:
                        payload = dict(track)
                        payload.setdefault("http_headers", info.get("http_headers"))
                        success, _ = downloader.dl(str(path), payload, subtitle=True)
                        if not success:
                            continue
                        vtt = path.read_text(encoding="utf-8-sig", errors="replace")
                    except (DownloadError, ExtractorError, RequestError, OSError) as error:
                        logger.warning(
                            "Could not read %s %s captions: %s",
                            kind,
                            language,
                            type(error).__name__,
                        )
                        continue
                    cues = _parse_vtt(vtt, automatic=kind == "ASR")
                    if cues:
                        logger.info("Using %s %s captions (%d cues)", kind, language, len(cues))
                        return ExtractedSource(
                            canonical={
                                "type": "youtube-captions",
                                "video_id": info.get("id"),
                                "title": info.get("title"),
                                "language": language,
                                "caption_track_kind": kind,
                                "segments": [asdict(cue) for cue in cues],
                            },
                            segments=[_transcript_segment([cue]) for cue in cues],
                            caption_track_kind=kind,
                        )
    raise RuntimeError(NO_CAPTIONS)


def _parse_vtt(vtt: str, *, automatic: bool) -> list[TranscriptCue]:
    lines = vtt.splitlines()
    if not lines or not re.match(r"^WEBVTT(?:\s|$)", lines[0]):
        return []
    cues: list[TranscriptCue] = []
    previous_text = ""
    previous_end = -1.0
    for block in re.split(r"\n[ \t]*\n", "\n".join(lines[1:])):
        lines = block.strip().splitlines()
        if not lines or re.match(r"^(?:NOTE|STYLE|REGION)(?:\s|$)", lines[0]):
            continue
        timing = VTT_CUE.match(lines[0])
        index = 0
        if timing is None and len(lines) > 1:
            timing = VTT_CUE.match(lines[1])
            index = 1
        if timing is None:
            continue

        start, end = map(_vtt_seconds, timing.groups())
        if end <= start:
            continue
        body = lines[index + 1 :]
        parts = [" ".join(unescape(re.sub(r"<[^>]+>", "", line)).split()) for line in body]
        text = original = " ".join(part for part in parts if part)
        if automatic and start <= previous_end and previous_text:
            timed = [bool(VTT_INLINE_TIME.search(line)) for line in body]
            repeated_suffix = previous_text == text or previous_text.endswith(f" {text}")
            if repeated_suffix and end - start <= 0.02 and not any(timed):
                # A brief redraw can separate rolling cues without adding spoken words.
                text = ""
            elif start < previous_end and text == previous_text and not any(timed):
                text = ""
            elif len(parts) > 1 and parts[0] and not timed[0] and any(timed[1:]):
                # YouTube can redraw the last line above new, individually timed words.
                if previous_text == parts[0] or previous_text.endswith(f" {parts[0]}"):
                    text = " ".join(part for part in parts[1:] if part)
        if original:
            previous_text, previous_end = original, end
        if text:
            cues.append(TranscriptCue(start, end, text))
    return sorted(cues, key=lambda cue: cue.start)


def _vtt_seconds(value: str) -> float:
    seconds = 0.0
    for component in value.split(":"):
        seconds = seconds * 60 + float(component)
    return seconds


def canonical_bytes(extracted: ExtractedSource) -> bytes:
    """Serialize a canonical extracted source for object storage."""
    return json.dumps(extracted.canonical, ensure_ascii=False).encode("utf-8")


def _timestamp(seconds: float) -> str:
    """Format cue times without losing subsecond precision or wrapping at an hour."""
    total, milliseconds = divmod(round(seconds * 1000), 1000)
    hours, remainder = divmod(total, 3600)
    minutes, secs = divmod(remainder, 60)
    prefix = f"{hours:02d}:" if hours else ""
    fraction = f".{milliseconds:03d}" if milliseconds else ""
    return f"{prefix}{minutes:02d}:{secs:02d}{fraction}"
