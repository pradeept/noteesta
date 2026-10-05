# Noteesta — Hackathon Plan

## Product vision

**Noteesta turns one or more learning sources into a Study Pill containing portable Markdown notes with generated charts and visuals. Roadmaps, flashcards, MCQs, and true-or-false questions are optional extras generated alongside the notes.**

Product inspiration: Turbo.ai.

A Study Pill is a bounded learning unit—such as *Cell Biology: Lecture 4*—that contains its sources, generated study material, and a follow-up chat. It is more than a chat session: outputs are retained, structured, and traceable to their source.

## Supported inputs

- YouTube link or local video file
- Class voice recording
- PDF, DOCX, PPTX, typed notes, and other supported documents
- Images or scans of handwritten notes

For YouTube, start with available captions/transcripts where possible and ensure ingestion follows platform terms and the student's rights to use the material.

## Student flow

1. Create a Study Pill and upload one or more sources, select previously uploaded files from object storage, or combine both.
2. Noteesta processes the selected sources into a searchable knowledge base isolated to that Pill:
   - timestamped transcripts
   - extracted text, tables, headings, and diagrams
   - selected video frames/slides
   - source references: page, timestamp, or note location
3. Generate notes with charts and visuals, optionally selecting any combination of roadmap, flashcards, MCQs, and true-or-false questions to generate alongside them.
4. Optionally set detail level, learner level, target exam date, and study hours per day.
5. Receive a Study Pill workspace containing:
   - Markdown notes with citations
   - key concepts, formulas, examples, and common confusions
   - source-grounded visuals such as charts, concept maps, timelines, and labelled diagrams
   - a study roadmap, if selected
   - selected flashcards, MCQs, and true-or-false questions, with answers and explanations
   - a chat that answers only from the Study Pill's sources

## Differentiator

Every generated claim should link to its evidence: a source page, timestamp, or uploaded-note location. Noteesta should feel like a trustworthy study companion, not an ungrounded summarizer.

## Hackathon MVP

Build a narrow, polished first version:

- Create a Study Pill
- Upload or select one or more documents, images, audio recordings, or videos in any combination
- Parse and chunk it into a searchable source collection
- Generate Markdown notes with charts and visuals plus any selected roadmap, flashcards, MCQs, and true-or-false outputs
- Export notes and selected extras as Markdown with bundled visual assets
- Provide a simple source-grounded Study Pill chat

Defer multi-source conflict resolution, sharing/collaboration, spaced-repetition analytics, and complex generated infographics.

## Markdown output and generated visuals

- Use Markdown for the notes and portable exports. Keep structured internal data for interactive quizzes, flashcards, citations, and visual specifications.
- Generate simple data charts, flowcharts, concept maps, and timelines where they help explain the selected material.
- Have the model produce structured visual specifications; render them with application-controlled code rather than executing model-generated code.
- Charts must use quantities present in the selected sources. Conceptual diagrams must reflect relationships supported by those sources. Preserve citations for both.
- Export visuals as PNG assets referenced through relative Markdown image links, with descriptive alt text and captions. Bundle the Markdown files and an `assets/` directory in a ZIP so exported notes do not depend on live application URLs or special diagram renderers.
- Include readable source references with page numbers or timestamps in the export.
- This iteration excludes web image search and image-generation models.

## Notes reading experience and accessibility

Render the Markdown as a polished, calm study document, inspired by the reading experience of Turbo.ai and Notion. Prioritize clear structure, minimal distraction, and familiar interactions that make studying pleasant and intuitive.

- **Comfortable reading:** clear heading hierarchy, readable typography, generous line spacing, a comfortable text-column width, and consistent treatment of lists, tables, formulas, captions, and citations. Keep secondary controls unobtrusive and the notes central.
- **Easy navigation:** a collapsible table of contents with section links and an active-section indicator. Preserve reading position when opening and closing previews or switching between notes and selected study extras.
- **Image and chart previews:** click, tap, or activate with the keyboard to open a larger preview, with zoom controls and a visible close button. Escape closes it. Keep keyboard focus inside the preview while open, then return focus to the originating image control and restore the reading position.
- **Accessible by default:** semantic headings and landmarks, keyboard-operable controls, visible focus indicators, descriptive control labels and image alt text, sufficient color contrast, and no information conveyed by color alone. Give charts a text summary or accessible data table.
- **Reading preferences and responsiveness:** support light/dark themes, readable text resizing and browser zoom, and reduced-motion preferences. Adapt navigation and tables for mobile without making the whole page scroll horizontally; provide comfortable touch targets.
- **Helpful feedback:** clear generation progress and retry actions, quiet confirmation when copying or exporting, and no disruptive layout jumps as visuals load. Use subtle, purposeful transitions and friendly microcopy for delight without distracting from study.
- **Source access:** citations open the relevant page or timestamp with a clear way back to the notes. Optional study materials remain easy to access without crowding the reading surface.

## Technical architecture

```text
Next.js app
  └─ Upload / Study Pill UI / Study workspace
       └─ FastAPI
            ├─ Source ingestion
            ├─ Background job queue
            ├─ RAG + generation service
            └─ MongoDB metadata + Vector Search
                 ├─ Object storage for originals and generated assets
                 └─ Ollama model-serving endpoint
```

### Stack

- **Frontend:** Next.js, Tailwind CSS, shadcn/ui
- **Backend:** FastAPI and Pydantic
- **Background jobs:** Redis with Celery; processing must not run in request handlers
- **RAG and orchestration:** LangChain text splitters, Ollama chat and embedding integrations, and `langchain-mongodb` Atlas Vector Search retrieval scoped by user and Study Pill
- **Object storage:** SeaweedFS single-node mode for local development; keep the API on the S3-compatible interface
- **Metadata and vectors:** MongoDB with Vector Search
- **Document parsing:** Docling; retain its JSON as the canonical parsed artifact rather than only flattened Markdown
- **Transcription:** faster-whisper with Whisper small
- **Model serving:** Ollama for the local Qwen runtime

Store source provenance with each vector. MongoDB Atlas Vector Search applies user and Study Pill prefilters during retrieval; the Atlas vector index must include the embedding field and both filter fields.

## Open-weight model choice

Use **Qwen3-VL-8B-Instruct** as the primary model for the hackathon.

Why:

- Apache-2.0 licence
- Multimodal image and text input
- Strong OCR, STEM, document, and visual reasoning
- Suitable for interpreting handwritten notes, diagrams, lecture slides, and sampled video frames
- Supports long-context video reasoning and timestamp-aware event localization
- Small enough to make quantized local serving realistic for a demo

Pipeline responsibilities:

```text
Whisper             → audio/video to timestamped transcript
Docling             → documents/images to structured content and page metadata
Qwen3-VL-8B-Instruct → visual interpretation, synthesis, and structured study outputs through Ollama
Mongo Vector Search → retrieval for generation and grounded chat
```

**Alternative:** Gemma 3 is a good compact multimodal option, especially when running on a single GPU is the dominant constraint. Qwen3-VL is the preferred first choice for Noteesta because of its document-visual and video-oriented capabilities.

## Generation quality contract

### Source coverage

- Process all selected sources within the Study Pill section by section, then combine their content into the final notes and any selected optional outputs.
- Preserve source references through processing and synthesis so the final material remains traceable.
- Do not generate the entire study pack from only the top vector-search results; they may omit relevant sections. Use vector retrieval for targeted lookups and grounded chat.
- Scope every retrieval to the current user and the Study Pill's selected source IDs.

### Structured outputs

Generate structured output, validate it, then display it. Each generated learning item must include evidence.

```json
{
  "flashcard": {
    "front": "What is photosynthesis?",
    "back": "The process by which...",
    "evidence": [
      {"sourceId": "lecture-1", "timestamp": "08:42"}
    ]
  }
}
```

For every MCQ, require:

- one unambiguous correct answer
- a short explanation
- at least one evidence citation
- no claims unsupported by the Study Pill's sources

## Demo narrative

> “I upload a messy lecture recording and handwritten notes. In minutes, Noteesta gives me an evidence-backed study plan and tests me on exactly what I need to learn.”

## Implementation toolchain

- Manage the Next.js frontend exclusively with **pnpm**. Commit `pnpm-lock.yaml`, use `pnpm dev`, `pnpm build`, and `pnpm test`, and use pnpm in the frontend container build.
- Manage the Python backend exclusively with **uv**. The backend is a uv project rooted at `api/`, with `fastapi[standard]` as its web framework dependency. Use `uv sync`, `uv run fastapi dev`, and `uv run pytest`.
- Run every required LLM job through the shared prompt files in `prompts/` and evaluate those jobs with Promptfoo against the configured local Ollama model.
- Keep Promptfoo configuration, providers, and assertions with the FastAPI project under `api/evals/`; implement the provider and assertions in Python. Promptfoo's Node CLI may be invoked through `pnpm dlx`, but it must not be a dependency or script of the Next.js package.
