# Noteesta system architecture

This page describes the current implementation. See the [backend guide](backend.md) for the domain layout and API routes, and the [root README](../README.md) for setup. The [original architecture diagram](diagrams/system-architecture.svg) and its [Mermaid source](diagrams/system-architecture.mmd) preserve the early proposal; differences are listed below.

## Responsibilities

| Component | Responsibility |
| --- | --- |
| Next.js | Public landing page and read-only example; authenticated workspace with Pill creation, collections, source library, reading, practice, progress polling, chat, and export |
| FastAPI | Validate input, authenticate users, manage rotating JWT sessions, scope data access by verified user ID, store uploads, queue generation, expose artifacts, answer chat, and build exports |
| Redis | Celery broker/result backend and auth rate limiting; the task payload contains the Pill ID |
| Celery | Extract sources, analyze every chunk, index embeddings, synthesize notes and selected extras, render PNG visuals, and optionally generate 3D artifacts |
| MongoDB + Atlas Vector Search | Users, sessions, OAuth/email transactions, collections, Pill metadata/settings/progress/artifacts, source chunks and embeddings, and separate 3D scene documents |
| S3-compatible object storage | Original uploads, canonical extracted JSON, and generated PNG visuals; local Compose uses SeaweedFS |
| Docling | Parse documents/images with OCR and retain canonical JSON; extracted Markdown sections supply generation text |
| faster-whisper | Transcribe uploaded audio/video with the configured Whisper model, default `small`, retaining timestamps |
| yt-dlp | Fetch accessible English YouTube captions, including automatic captions |
| Generation adapters | Use the saved per-Pill choice for chunk analysis, notes, selected practice materials, visual specifications, and grounded chat |
| Ollama embeddings | Use `OLLAMA_EMBEDDING_MODEL`, default `nomic-embed-text`, for source indexing and chat queries regardless of generation provider |
| Interactive 3D | Use the configured Ollama generation model for a cited spatial brief and `OPENAI_3D_MODEL` for bounded Three.js scene code |

The generation catalog supports configured Ollama, Gemma 4 26B, OpenAI GPT-5.4 variants, and Anthropic Claude Sonnet 5.5. `/api/v1/models` reports availability based on installed Ollama models, embeddings, and configured server keys.

## Frontend data

TanStack Query owns workspace server data with user-scoped keys, targeted mutation invalidation, cancellation, and visibility-aware progress polling. Access tokens stay in memory, refresh cookies are HttpOnly, and private caches clear on logout/account changes. Sonner provides success, error, and warning feedback; local UI state stays in React.

## Processing sequence

1. FastAPI validates multipart creation fields, the selected generation option, upload sizes, and the optional YouTube URL. It uploads original files, saves the Pill with its sources, settings, and model selection, and queues `process_pill_task` with the Pill ID. The response is HTTP 202.
2. The worker loads that Pill and extracts each source. Plain-text files are decoded directly; documents/images use Docling; audio/video use transcription; YouTube uses captions. Canonical extraction JSON is stored in object storage.
3. Every extracted text chunk is analyzed with its source ID, name, and locator. This runs sequentially. The pipeline retains the complete set of analyses for synthesis.
4. Chunks are embedded and indexed in MongoDB before note synthesis. The vector prefilters use `user_id` and `pill_id`. Full-source synthesis uses all chunk analyses rather than a top-k retrieval result.
5. The selected provider synthesizes cited notes and then selected flashcards, MCQs, true-or-false questions, and roadmap items. MCQ generation targets two or five questions based on note depth and allows up to two supplemental requests.
6. The worker attempts a structured visual specification and renders it to PNG using application code. If selected, interactive 3D runs through its separate Ollama/OpenAI path. Visual or 3D failure can leave the rest of the Pill usable.
7. The final structured artifact, source status, progress, and processing duration are saved on the Pill in MongoDB. Scene code and the cited 3D handoff live in `pill_three_d`; PNGs stay in object storage. The browser polls the Pill route and fetches scene code when needed.

## Chat and export

Chat runs in FastAPI. It embeds the question, retrieves chunks using user/Pill filters, and calls the Pill's saved generation provider. Responses include citations validated against the retrieved passages; insufficient evidence produces an explicit limitation.

Export also runs in FastAPI. It builds a ZIP in memory containing one `notes.md` file with notes and available practice materials, plus `assets/` PNGs. Markdown uses relative image links and readable source references. ZIP files and generated Markdown are not persisted in object storage, and exports exclude original uploads and interactive 3D code.

## Job behavior

Pills track queued, processing, ready, and failed states with progress, stage, error, and elapsed processing duration. Celery retries configured transient database, HTTP transport, storage, connection, and timeout failures up to twice, with backoff and jitter. Manual retry/regeneration accepts failed or ready Pills and preserves the saved source list, settings, and generation selection.

Each worker task runs its asynchronous database work on one event loop and closes that task's MongoDB client before the loop ends. Reprocessing replaces indexed chunks and writes artifacts under stable Pill/source keys; the implementation does not maintain immutable, versioned job snapshots.

## Current boundaries and original design differences

- Email/password and Google authenticate verified accounts. FastAPI validates access JWTs against active MongoDB sessions; refresh JWTs rotate in HttpOnly cookies. See the [authentication guide](authentication.md).
- The library lists attached sources and supports original-file download/deletion. Selecting an existing library file for a new Pill is not implemented.
- Video processing currently covers the audio transcript. Frame sampling and visual slide analysis remain planned.
- YouTube ingestion requires accessible English captions; it does not fall back to downloading/transcribing video.
- Canonical extraction JSON, original files, and PNGs are in object storage. Generated structured notes are in MongoDB; ZIP export is built during the HTTP request.
- Embedding/indexing is sequential with source analysis and synthesis, rather than a parallel background branch.
- Source locators include transcript/caption timestamps and Docling-derived section labels. Citations show saved excerpts; opening every original at an exact page or timestamp is not implemented.
- MongoDB Vector Search is an Atlas deployment prerequisite. The README documents the default 768-dimensional embedding index; hardware, concurrency sizing, and production storage deployment remain deployment decisions.

The HTML prototypes and original diagram gallery remain design artifacts. Their proposed flows include capabilities beyond this implementation.
