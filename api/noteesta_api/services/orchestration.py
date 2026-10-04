"""LangChain-backed orchestration for the structured Study Pill generation jobs."""

from typing import Any

from noteesta_api.llm import (
    MATERIALS_SCHEMA,
    NOTES_SCHEMA,
    SECTION_SCHEMA,
    VISUAL_SCHEMA,
    OllamaClient,
)
from noteesta_api.prompts import render_prompt


class StudyPillOrchestrator:
    """Coordinate source analysis and generation with shared prompts and schemas."""

    def __init__(self, client: OllamaClient | None = None) -> None:
        self.client = client or OllamaClient()

    async def analyze_section(
        self,
        *,
        source_id: str,
        source_name: str,
        locator: str,
        source_text: str,
    ) -> dict[str, Any]:
        """Extract grounded claims from one chunk of a source."""

        return await self.client.generate_json(
            render_prompt(
                "section-extraction",
                source_id=source_id,
                source_name=source_name,
                locator=locator,
                source_text=source_text,
            ),
            SECTION_SCHEMA,
            num_predict=1800,
        )

    async def synthesize_notes(
        self, *, detail_level: str, learner_level: str, section_analyses: str
    ) -> dict[str, Any]:
        """Combine all source analyses into citation-bearing study notes."""

        return await self.client.generate_json(
            render_prompt(
                "notes-synthesis",
                detail_level=detail_level,
                learner_level=learner_level,
                section_analyses=section_analyses,
            ),
            NOTES_SCHEMA,
            num_predict=7000,
        )

    async def generate_materials(
        self, *, requested_materials: str, study_context: str, grounded_notes: str
    ) -> dict[str, Any]:
        """Create the selected practice materials from grounded generated notes."""

        return await self.client.generate_json(
            render_prompt(
                "materials-generation",
                requested_materials=requested_materials,
                study_context=study_context,
                grounded_notes=grounded_notes,
            ),
            MATERIALS_SCHEMA,
            num_predict=5000,
        )

    async def generate_visual(self, *, grounded_notes: str) -> dict[str, Any]:
        """Create a structured visual specification that the app can safely render."""

        return await self.client.generate_json(
            render_prompt("visual-spec", grounded_notes=grounded_notes),
            VISUAL_SCHEMA,
            num_predict=2200,
        )
