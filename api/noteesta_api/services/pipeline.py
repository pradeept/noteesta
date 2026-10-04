import json
import logging
import re
from typing import Any

from langchain_core.documents import Document

from noteesta_api.database import get_database
from noteesta_api.repository import (
    PillRepository,
    artifact_for_storage,
    sources_for_storage,
)
from noteesta_api.schemas import (
    Citation,
    Flashcard,
    MaterialKey,
    Mcq,
    NoteSection,
    RoadmapItem,
    Source,
    StudyArtifact,
    TrueFalseQuestion,
    VisualSpec,
)
from noteesta_api.services.extraction import (
    canonical_bytes,
    chunk_segments,
    extract_source,
)
from noteesta_api.services.orchestration import StudyPillOrchestrator
from noteesta_api.services.rag import StudyPillRetriever
from noteesta_api.services.rendering import render_visual
from noteesta_api.storage import get_storage

logger = logging.getLogger(__name__)


async def process_pill(pill_id: str) -> None:
    """Build a fully cited Study Pill through extraction, RAG indexing, and generation."""

    logger.info("Pill %s: worker started; opening database", pill_id)
    repository: PillRepository | None = None
    try:
        database = get_database()
        repository = PillRepository(database)
        await repository.update(
            pill_id,
            status="processing",
            stage="Starting the study worker",
            progress=4,
            error=None,
        )
        pill = await repository.get(pill_id)
        if pill is None:
            raise ValueError(f"Unknown Study Pill: {pill_id}")

        logger.info(
            "Pill %s: loaded %d source(s); initializing storage and language model",
            pill_id,
            len(pill.sources),
        )
        storage = get_storage()
        orchestrator = StudyPillOrchestrator()
        retriever = StudyPillRetriever(database, orchestrator.client)
        analyses: list[dict[str, Any]] = []
        chunk_documents: list[Document] = []
        source_lookup = {source.id: source for source in pill.sources}

        for source_index, source in enumerate(pill.sources):
            source.status = "processing"
            source_progress = 8 + int(30 * source_index / len(pill.sources))
            await repository.update(
                pill_id,
                stage=f"Reading source {source_index + 1} of {len(pill.sources)}: {source.name}",
                progress=source_progress,
                sources=sources_for_storage(pill.sources),
            )
            logger.info(
                "Pill %s: reading source %d/%d (%s, type=%s)",
                pill_id,
                source_index + 1,
                len(pill.sources),
                source.name,
                source.kind,
            )
            extracted = await extract_source(source, storage)
            logger.info(
                "Pill %s: extracted %d segment(s) from %s",
                pill_id,
                len(extracted.segments),
                source.name,
            )
            canonical_key = f"users/{pill.user_id}/pills/{pill.id}/parsed/{source.id}.json"
            await storage.put_bytes(canonical_key, canonical_bytes(extracted), "application/json")
            chunks = chunk_segments(extracted.segments)
            if not chunks:
                raise RuntimeError(f"No readable content was found in {source.name}")

            logger.info(
                "Pill %s: analyzing %d chunk(s) from %s",
                pill_id,
                len(chunks),
                source.name,
            )
            for chunk_index, chunk in enumerate(chunks):
                chunk_progress = 8 + int(
                    30 * (source_index + chunk_index / len(chunks)) / len(pill.sources)
                )
                await repository.update(
                    pill_id,
                    stage=(
                        f"Analyzing source {source_index + 1} of {len(pill.sources)}: "
                        f"section {chunk_index + 1} of {len(chunks)}"
                    ),
                    progress=chunk_progress,
                )
                logger.info(
                    "Pill %s: analyzing %s section %d/%d (%s)",
                    pill_id,
                    source.name,
                    chunk_index + 1,
                    len(chunks),
                    chunk.locator,
                )
                result = await orchestrator.analyze_section(
                    source_id=source.id,
                    source_name=source.name,
                    locator=chunk.locator,
                    source_text=chunk.text,
                )
                result["sourceId"] = source.id
                result["sourceName"] = source.name
                result["locator"] = chunk.locator
                analyses.append(result)
                chunk_documents.append(
                    Document(
                        page_content=chunk.text,
                        metadata={
                            "source_id": source.id,
                            "source_name": source.name,
                            "locator": chunk.locator,
                            "analysis": result,
                        },
                    )
                )
                logger.info(
                    "Pill %s: finished %s section %d/%d",
                    pill_id,
                    source.name,
                    chunk_index + 1,
                    len(chunks),
                )

            source.status = "ready"
            source.excerpt = chunks[0].text[:240]
            progress = 8 + int(30 * (source_index + 1) / len(pill.sources))
            await repository.update(
                pill_id,
                sources=sources_for_storage(pill.sources),
                progress=progress,
            )

        await repository.update(pill_id, stage="Indexing source sections for search", progress=42)
        logger.info("Pill %s: indexing %d section(s) for retrieval", pill_id, len(chunk_documents))
        await retriever.index(pill_id=pill.id, user_id=pill.user_id, documents=chunk_documents)

        await repository.update(pill_id, stage="Writing cited study notes", progress=50)
        logger.info("Pill %s: synthesizing cited notes", pill_id)
        notes_raw = await orchestrator.synthesize_notes(
            detail_level=str(pill.settings.get("detail_level", "balanced")),
            learner_level=str(pill.settings.get("learner_level", "intermediate")),
            section_analyses=json.dumps(analyses, ensure_ascii=False),
        )
        sections = _note_sections(notes_raw.get("sections", []), source_lookup, pill_id)
        if not sections:
            raise RuntimeError("The model returned no note sections")

        await repository.update(pill_id, stage="Building practice materials", progress=68)
        grounded_notes = json.dumps(notes_raw, ensure_ascii=False)
        selected = {
            item.value if isinstance(item, MaterialKey) else str(item)
            for item in pill.selected_materials
        }
        requested = sorted(selected - {MaterialKey.notes.value})
        materials_raw: dict[str, Any] = {}
        if requested:
            logger.info("Pill %s: generating materials: %s", pill_id, ", ".join(requested))
            materials_raw = await orchestrator.generate_materials(
                requested_materials=json.dumps(requested),
                study_context=json.dumps(pill.settings, ensure_ascii=False),
                grounded_notes=grounded_notes,
            )

        visuals: list[VisualSpec] = []
        try:
            await repository.update(pill_id, stage="Creating a visual summary", progress=86)
            logger.info("Pill %s: generating visual summary", pill_id)
            visual_raw = await orchestrator.generate_visual(grounded_notes=grounded_notes)
            visual = VisualSpec(
                id="visual-1",
                title=visual_raw["title"],
                description=visual_raw["description"],
                kind=visual_raw["kind"],
                nodes=visual_raw.get("nodes", []),
                edges=visual_raw.get("edges", []),
                data=visual_raw.get("data", []),
                citations=_citations(visual_raw.get("evidence", []), source_lookup),
            )
            asset_key = f"users/{pill.user_id}/pills/{pill.id}/assets/{visual.id}.png"
            await storage.put_bytes(asset_key, render_visual(visual), "image/png")
            visual.asset_key = asset_key
            visual.asset_url = await storage.presigned_url(asset_key)
            visuals.append(visual)
        except Exception:
            logger.exception("Visual generation failed for pill %s; notes remain usable", pill_id)

        artifact = StudyArtifact(
            summary=notes_raw["summary"],
            sections=sections,
            visuals=visuals,
            flashcards=_flashcards(materials_raw.get("flashcards", []), source_lookup),
            mcqs=_mcqs(materials_raw.get("mcqs", []), source_lookup),
            true_false=_true_false(materials_raw.get("trueFalse", []), source_lookup),
            roadmap=_roadmap(materials_raw.get("roadmap", [])),
        )
        await repository.update(
            pill_id,
            artifact=artifact_for_storage(artifact),
            status="ready",
            stage="Ready to study",
            progress=100,
            sources=sources_for_storage(pill.sources),
        )
    except Exception as error:
        logger.exception("Pill %s: generation failed: %s", pill_id, error)
        if repository is not None:
            try:
                await repository.update(
                    pill_id,
                    status="failed",
                    stage="Generation stopped",
                    error=str(error),
                )
            except Exception:
                logger.exception("Pill %s: could not persist failed status", pill_id)
        raise


def _citations(evidence: list[dict[str, Any]], sources: dict[str, Source]) -> list[Citation]:
    """Convert model evidence into citations that point to selected sources only."""
    citations: list[Citation] = []
    for item in evidence:
        source_id = str(item.get("sourceId", ""))
        source = sources.get(source_id)
        if not source:
            continue
        citations.append(
            Citation(
                source_id=source_id,
                source_name=source.name,
                locator=str(item.get("locator", "source")),
                excerpt=str(item.get("excerpt", "")),
            )
        )
    return citations


def _note_sections(
    raw_sections: Any, sources: dict[str, Source], pill_id: str
) -> list[NoteSection]:
    """Validate synthesized sections and recover a useful title if the model omitted it."""
    if not isinstance(raw_sections, list):
        raise ValueError("The model returned an invalid note sections list")

    sections: list[NoteSection] = []
    used_ids: set[str] = set()
    for index, item in enumerate(raw_sections, start=1):
        if not isinstance(item, dict):
            raise ValueError(f"The model returned an invalid note section at position {index}")

        markdown = item.get("markdown")
        if not isinstance(markdown, str) or not markdown.strip():
            raise ValueError(f"Note section {index} is missing Markdown content")

        title = item.get("title")
        if not isinstance(title, str) or not title.strip():
            title = _infer_section_title(markdown) or f"Study notes {index}"
            logger.warning(
                "Pill %s: notes synthesis omitted the title for section %d; inferred %r",
                pill_id,
                index,
                title,
            )

        section_id = item.get("id")
        if not isinstance(section_id, str) or not section_id.strip():
            section_id = _section_slug(title) or f"section-{index}"
            logger.warning(
                "Pill %s: notes synthesis omitted the ID for section %d; inferred %r",
                pill_id,
                index,
                section_id,
            )
        base_id = section_id
        suffix = 2
        while section_id in used_ids:
            section_id = f"{base_id}-{suffix}"
            suffix += 1
        used_ids.add(section_id)

        evidence = item.get("evidence", [])
        if not isinstance(evidence, list):
            raise ValueError(f"Note section {index} has invalid evidence")
        citations = _citations(evidence, sources)
        if not citations:
            raise ValueError(f"Note section {index} has no evidence linked to the selected sources")

        sections.append(
            NoteSection(
                id=section_id,
                title=title.strip(),
                markdown=markdown.strip(),
                citations=citations,
            )
        )
    return sections


def _infer_section_title(markdown: str) -> str:
    for line in markdown.splitlines():
        line = line.strip()
        if not line:
            continue
        heading = re.match(r"^#{1,6}\s+(.+?)\s*#*$", line)
        title = heading.group(1) if heading else line
        title = re.sub(r"[`*_~]", "", title).strip()
        if title:
            return title[:100]
    return ""


def _section_slug(title: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")


def _flashcards(rows: list[dict[str, Any]], sources: dict[str, Source]) -> list[Flashcard]:
    """Map validated flashcard rows into the API representation."""
    return [
        Flashcard(
            id=f"flashcard-{index + 1}",
            front=row["front"],
            back=row["back"],
            citations=_citations(row.get("evidence", []), sources),
        )
        for index, row in enumerate(rows)
    ]


def _mcqs(rows: list[dict[str, Any]], sources: dict[str, Source]) -> list[Mcq]:
    """Map validated multiple-choice rows into the API representation."""
    return [
        Mcq(
            id=f"mcq-{index + 1}",
            question=row["question"],
            choices=row["choices"],
            correct_index=row["correctIndex"],
            explanation=row["explanation"],
            citations=_citations(row.get("evidence", []), sources),
        )
        for index, row in enumerate(rows)
    ]


def _true_false(rows: list[dict[str, Any]], sources: dict[str, Source]) -> list[TrueFalseQuestion]:
    """Map validated true-or-false rows into the API representation."""
    return [
        TrueFalseQuestion(
            id=f"true-false-{index + 1}",
            statement=row["statement"],
            answer=row["answer"],
            explanation=row["explanation"],
            citations=_citations(row.get("evidence", []), sources),
        )
        for index, row in enumerate(rows)
    ]


def _roadmap(rows: list[dict[str, Any]]) -> list[RoadmapItem]:
    """Map roadmap rows into the API representation."""
    return [
        RoadmapItem(
            id=f"roadmap-{index + 1}",
            title=row["title"],
            description=row["description"],
            section_id=row["sectionId"],
        )
        for index, row in enumerate(rows)
    ]
