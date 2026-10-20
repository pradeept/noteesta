import json
import re
import shutil
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from langchain_text_splitters import RecursiveCharacterTextSplitter

from noteesta_api.config import get_settings
from noteesta_api.schemas import Source
from noteesta_api.storage import ObjectStorage


@dataclass
class ExtractedSegment:
    locator: str
    text: str


@dataclass
class ExtractedSource:
    canonical: dict[str, Any]
    segments: list[ExtractedSegment]


async def extract_source(source: Source, storage: ObjectStorage) -> ExtractedSource:
    """Extract a source into canonical data and provenance-preserving text segments."""
    if source.kind == "youtube":
        return await _extract_youtube(source)
    if not source.object_key:
        raise ValueError(f"Source {source.name} has no stored object")
    content = await storage.get_bytes(source.object_key)
    suffix = Path(source.name).suffix.lower()

    if suffix in {".txt", ".md", ".csv"}:
        text = content.decode("utf-8", errors="replace")
        return ExtractedSource(
            canonical={"type": "plain-text", "text": text},
            segments=[ExtractedSegment(locator="document", text=text)],
        )
    if source.kind in {"audio", "video"}:
        return _transcribe_media(content, suffix)
    return _parse_with_docling(content, suffix or ".bin")


def chunk_segments(segments: list[ExtractedSegment]) -> list[ExtractedSegment]:
    """Split each source segment with LangChain while retaining its source locator."""

    settings = get_settings()
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=settings.chunk_size,
        chunk_overlap=settings.chunk_overlap,
        length_function=len,
    )
    chunks: list[ExtractedSegment] = []
    for segment in segments:
        text = re.sub(r"\s+", " ", segment.text).strip()
        if not text:
            continue
        chunks.extend(
            ExtractedSegment(locator=segment.locator, text=chunk)
            for chunk in splitter.split_text(text)
            if chunk.strip()
        )
    return chunks


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
        raise RuntimeError(
            "Document and image parsing requires `uv sync` in api/."
        ) from error

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


def _transcribe_media(content: bytes, suffix: str) -> ExtractedSource:
    """Transcribe an uploaded recording and preserve timestamps as locators."""
    try:
        from faster_whisper import WhisperModel
    except ImportError as error:
        raise RuntimeError(
            "Audio and video transcription requires `uv sync` in api/."
        ) from error

    settings = get_settings()
    with tempfile.TemporaryDirectory(prefix="noteesta-media-") as directory:
        path = Path(directory) / f"source{suffix}"
        path.write_bytes(content)
        model = WhisperModel(settings.whisper_model, device=settings.whisper_device)
        segments, info = model.transcribe(str(path), vad_filter=True)
        rows = [
            {
                "start": segment.start,
                "end": segment.end,
                "text": segment.text.strip(),
            }
            for segment in segments
            if segment.text.strip()
        ]
    return ExtractedSource(
        canonical={
            "type": "whisper-transcript",
            "language": info.language,
            "segments": rows,
        },
        segments=[
            ExtractedSegment(
                locator=f"{_timestamp(row['start'])}-{_timestamp(row['end'])}",
                text=row["text"],
            )
            for row in rows
        ],
    )


async def _extract_youtube(source: Source) -> ExtractedSource:
    """Fetch permitted YouTube captions and preserve caption timestamps."""
    try:
        import yt_dlp
    except ImportError as error:
        raise RuntimeError(
            "YouTube captions require `uv sync` in api/."
        ) from error
    if not source.url:
        raise ValueError("YouTube source is missing its URL")

    with tempfile.TemporaryDirectory(prefix="noteesta-youtube-") as directory:
        template = str(Path(directory) / "captions.%(ext)s")
        options = {
            "skip_download": True,
            "writesubtitles": True,
            "writeautomaticsub": True,
            "subtitleslangs": ["en", "en-US", "en-GB"],
            "subtitlesformat": "vtt",
            "outtmpl": template,
            "quiet": True,
        }
        # yt-dlp only enables Deno by default. Use Node when it is available so
        # YouTube's current JavaScript challenge can be solved in local/dev runs.
        if shutil.which("node"):
            options["js_runtimes"] = {"node": {}}
        with yt_dlp.YoutubeDL(options) as downloader:
            info = downloader.extract_info(source.url, download=True)
        files = list(Path(directory).glob("*.vtt"))
        if not files:
            raise RuntimeError(
                "No accessible English captions were available for this YouTube source"
            )
        vtt = files[0].read_text(encoding="utf-8", errors="replace")

    rows: list[dict[str, str]] = []
    current_locator = "caption"
    for line in vtt.splitlines():
        line = line.strip()
        if " --> " in line:
            current_locator = line.split(" --> ", 1)[0]
        elif (
            line
            and not line.startswith(("WEBVTT", "Kind:", "Language:"))
            and not line.isdigit()
        ):
            clean = re.sub(r"<[^>]+>", "", line)
            if not rows or rows[-1]["locator"] != current_locator:
                rows.append({"locator": current_locator, "text": clean})
            elif clean not in rows[-1]["text"]:
                rows[-1]["text"] += " " + clean

    return ExtractedSource(
        canonical={
            "type": "youtube-captions",
            "video_id": info.get("id"),
            "title": info.get("title"),
            "segments": rows,
        },
        segments=[
            ExtractedSegment(locator=row["locator"], text=row["text"]) for row in rows
        ],
    )


def canonical_bytes(extracted: ExtractedSource) -> bytes:
    """Serialize a canonical extracted source for object storage."""
    return json.dumps(extracted.canonical, ensure_ascii=False).encode("utf-8")


def _timestamp(seconds: float) -> str:
    """Format a transcript time offset as minutes and seconds."""

    total = int(seconds)
    return f"{total // 60:02d}:{total % 60:02d}"
