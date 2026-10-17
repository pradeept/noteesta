"""Turn a cited Qwen handoff into bounded Three.js scene code."""

import json
import re
from typing import Any

from openai import AsyncOpenAI
from pydantic import BaseModel

from noteesta_api.config import get_settings
from noteesta_api.schemas import Citation, Source, ThreeDMetadata
from noteesta_api.services.orchestration import StudyPillOrchestrator

MAX_JAVASCRIPT_BYTES = 64 * 1024


class SceneCode(BaseModel):
    javascript: str


def validate_scene_code(javascript: str) -> str:
    """Enforce the viewer contract before persisting generated code."""

    code = javascript.strip()
    if not code or len(code.encode("utf-8")) > MAX_JAVASCRIPT_BYTES:
        raise ValueError("The 3D scene code is empty or too large")
    if not re.search(r"\bfunction\s+buildArtifact\s*\(\s*THREE\s*,\s*scene\s*\)", code):
        raise ValueError("The 3D scene must define buildArtifact(THREE, scene)")
    unsupported = r"</script|<script|\b(?:import|export|fetch|XMLHttpRequest|WebSocket|Worker)\b"
    if re.search(unsupported, code, re.I):
        raise ValueError("The 3D scene contains unsupported markup or network code")
    return code


async def generate_scene_code(handoff: dict[str, Any]) -> str:
    """Ask GPT-5.4 for geometry code using only the grounded spatial brief."""

    settings = get_settings()
    if not settings.openai_api_key:
        raise ValueError("OpenAI API key is not configured for 3D generation")

    instructions = (
        "Create a small, educational Three.js schematic from the supplied source-grounded brief. "
        "Return JavaScript only in the javascript field. Define exactly one global function "
        "buildArtifact(THREE, scene). That function must add meshes to scene and may return "
        "{cameraPosition: [x,y,z], labels: [{text, position: [x,y,z]}]}. "
        "The host supplies THREE, camera, lights, canvas, orbit/pan/zoom controls, and rendering. "
        "Use basic Three.js geometry and materials only. No imports, HTML, CSS, animation loops, "
        "external resources, network requests, DOM access, or globals beyond the function. "
        "Use only parts and spatial relationships in the brief; do not add unsupported anatomy. "
        "Keep the geometry simple enough for a mobile GPU."
    )
    async with AsyncOpenAI(api_key=settings.openai_api_key, timeout=120, max_retries=1) as client:
        response = await client.responses.parse(
            model=settings.openai_3d_model,
            instructions=instructions,
            input=json.dumps(handoff, ensure_ascii=False),
            text_format=SceneCode,
            max_output_tokens=12000,
            store=False,
        )
    if response.output_parsed is None:
        raise ValueError("GPT-5.4 did not return a 3D scene")
    return validate_scene_code(response.output_parsed.javascript)


async def prepare_three_d(
    orchestrator: StudyPillOrchestrator,
    grounded_notes: str,
    sources: dict[str, Source],
) -> tuple[ThreeDMetadata, str | None, dict[str, Any] | None]:
    """Validate Qwen's spatial handoff before spending an OpenAI request."""

    raw = await orchestrator.generate_three_d_handoff(grounded_notes=grounded_notes)
    if not raw.get("suitable"):
        reason = str(raw.get("reason") or "The sources do not support a useful 3D model.")[:240]
        return ThreeDMetadata(status="unavailable", reason=reason), None, None

    parts = raw.get("parts")
    if not isinstance(parts, list) or not 2 <= len(parts) <= 8:
        raise ValueError("The 3D handoff needs two to eight supported parts")
    clean_parts = []
    for part in parts:
        if not isinstance(part, dict) or not all(
            isinstance(part.get(key), str) and part[key].strip()
            for key in ("name", "appearance", "relationship")
        ):
            raise ValueError("The 3D handoff has an incomplete part")
        clean_parts.append({key: part[key][:300] for key in ("name", "appearance", "relationship")})

    citations = []
    for item in raw.get("evidence", []):
        if not isinstance(item, dict):
            continue
        source_id = str(item.get("sourceId", ""))
        source = sources.get(source_id)
        if source and item.get("excerpt"):
            citations.append(
                Citation(
                    source_id=source_id,
                    source_name=source.name,
                    locator=str(item.get("locator", "source"))[:120],
                    excerpt=str(item["excerpt"])[:500],
                )
            )
    if not citations:
        raise ValueError("The 3D handoff has no selected-source evidence")

    title = str(raw.get("title") or "Interactive 3D model")[:100]
    description = str(raw.get("description") or "Schematic model of the selected sources.")[:500]
    handoff = {
        "title": title,
        "description": description,
        "parts": clean_parts,
        "evidence": [citation.model_dump(mode="json", by_alias=True) for citation in citations],
    }
    javascript = await generate_scene_code(handoff)
    return (
        ThreeDMetadata(
            status="ready", title=title, description=description, citations=citations
        ),
        javascript,
        handoff,
    )
