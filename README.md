# Noteesta

Noteesta turns recordings, documents, images, video, and YouTube captions into a source-grounded Study Pill. Each Pill contains readable notes, optional practice materials, controlled visual assets, portable Markdown export, and chat that stays inside the selected sources.

The implemented vertical slice follows the architecture in [`docs/system-architecture.md`](docs/system-architecture.md). The UI takes its layout and color direction from [`docs/prototypes/grove.html`](docs/prototypes/grove.html).

## Toolchain

- Frontend: Next.js, React, Tailwind CSS, and Phosphor icons, managed only with **pnpm**.
- Backend: `fastapi[standard]`, Pydantic, Celery, MongoDB, Redis, and SeaweedFS S3-compatible storage, managed only with **uv**.
- Local inference: Ollama with Qwen and a separate Ollama embedding model.
- Parsing: Docling for documents and images, faster-whisper `small` for recordings, and yt-dlp for accessible YouTube captions.
- LLM evaluation: Promptfoo suites for section extraction, note synthesis, optional materials, visual specifications, and grounded chat. The providers and assertions are Python files in the backend.

## Local setup

1. Create separate environment files for the frontend and backend. Set the exact model tag returned by `ollama list` in the backend file:

   ```bash
   cp .env.example .env
   cp api/.env.example api/.env
   ollama list
   ```

2. Install the frontend with pnpm:

   ```bash
   pnpm install
   ```

3. Install the backend with uv. The project includes Docling, faster-whisper, and yt-dlp because source ingestion supports documents, recordings, and accessible YouTube captions:

   ```bash
   cd api
   uv sync --extra dev
   cd ..
   ```

4. With the MongoDB Atlas URI set in `api/.env`, start Redis and SeaweedFS:

   ```bash
   docker compose --env-file api/.env up -d redis seaweedfs
   ```

5. Run each process in its own terminal:

   ```bash
   pnpm dev
   ```

   ```bash
   cd api && uv run fastapi dev noteesta_api/main.py
   ```

   ```bash
   cd api && uv run celery -A workers.celery_app:celery_app worker --loglevel=INFO --pool=solo
   ```

The app is at `http://localhost:3000`, the API docs are at `http://localhost:8000/docs`, and the SeaweedFS S3 endpoint is at `http://localhost:8333`. This setup does not expose an object-storage console; the application creates its configured bucket automatically.

The public homepage at `/` explains Noteesta, and `/app` serves the read-only photosynthesis example without API calls. `/llm` is a Markdown product guide for people and agents. To use the development workspace locally, set `NOTEESTA_ENABLE_WORKSPACE=true` in the root `.env`; its dashboard is at `/workspace`, and each live Study Pill opens at `/pills/<id>`. Keep this setting off in public deployments until real authentication and authorization are in place. A ready Pill can be regenerated from its footer to refresh practice questions; this processes its sources again.

The official public origin is `https://noteesta.com`. `NOTEESTA_SITE_URL` defaults to that origin for canonical metadata, robots.txt, sitemap.xml, and llms.txt. Set a different origin before building a preview deployment. The FastAPI service currently trusts a caller-provided user ID; do not expose it as a public service without replacing that mechanism with real authentication. The local Compose setup binds the API port to loopback for this reason.

You can also build the API, worker, and frontend with `docker compose --env-file .env --env-file api/.env up --build`. Compose does not start MongoDB; API and worker connect to the `MONGODB_URI` supplied by `api/.env`. API and worker containers read `api/.env`; Next.js reads the root `.env`. Ollama remains on the host by default and the containers use `OLLAMA_DOCKER_BASE_URL` from the backend environment file.

## Environment

The environment files are kept separate: [`.env.example`](.env.example) contains frontend variables, and [`api/.env.example`](api/.env.example) contains FastAPI, worker, storage, model, and Promptfoo variables. Next.js only reads the root `.env`; FastAPI reads `api/.env` regardless of its current working directory.

The backend values most likely to change are:

- `OLLAMA_MODEL`: exact Qwen tag, such as `qwen3-vl:8b-instruct`.
- `OLLAMA_EMBEDDING_MODEL`: embedding model, default `nomic-embed-text`.
- `OLLAMA_BASE_URL`: host used by local API and Promptfoo processes.
- `OLLAMA_DOCKER_BASE_URL`: host used by the API and worker containers.
- `ALLOW_DEMO_USER`: permits the `demo-user` development identity. Disable this when real authentication is connected.

## Promptfoo evals

The evals live under [`api/evals`](api/evals) with Python providers and Python assertions. They load the same shared prompt files used by the backend and run serially because local multimodal models can consume substantial memory.

Promptfoo's runner is a Node CLI, but it is not a frontend dependency or package script. Use its one-off pnpm runner with the backend's uv interpreter:

```bash
PROMPTFOO_PYTHON="$(cd api && uv run python -c 'import sys; print(sys.executable)')" \
  pnpm dlx promptfoo@0.123.1 eval -c api/evals/sections.yaml --env-file api/.env -j 1
```

Replace `sections.yaml` with `notes.yaml`, `materials.yaml`, `visuals.yaml`, or `chat.yaml` to run another required job. The Python provider reads `OLLAMA_BASE_URL` and `OLLAMA_MODEL`; Qwen reasoning is disabled for these structured-output jobs so assertions receive only final JSON.

The materials suite checks the MCQ target for concise notes (two questions) and fuller notes (five distinct questions), including source evidence for each answer.

Run all suites sequentially:

```bash
for config in sections notes materials visuals chat; do
  PROMPTFOO_PYTHON="$(cd api && uv run python -c 'import sys; print(sys.executable)')" \
    pnpm dlx promptfoo@0.123.1 eval -c "api/evals/${config}.yaml" --env-file api/.env -j 1 || exit 1
done
```

## Verification

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build

cd api
uv run ruff check .
uv run pytest
```

LangChain provides source chunking, Ollama embeddings, structured generation, and retrieval through MongoDB Atlas Vector Search. The API stores chunks in `noteesta.chunks`; Atlas filters each vector query by the top-level `user_id` and `pill_id` metadata fields.

For Atlas, create the `noteesta` database and `chunks` collection, then add a Vector Search index named `vector_index` with this definition:

```json
{
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
      "numDimensions": 768,
      "similarity": "cosine"
    },
    { "type": "filter", "path": "user_id" },
    { "type": "filter", "path": "pill_id" }
  ]
}
```

Wait for the index status to become **Ready** before processing a Study Pill. The dimension count is for the configured default `nomic-embed-text` model; change it if you configure another embedding model with a different output size.

## UI/UX improvements

- [x] Let users edit a Study Pill's title and add a description. Start with the italic, borderless “Add a description” placeholder.
- [x] Add tags and a way to organize multiple Study Pills into user-created groups. “Collections” may be clearer than “racks”; confirm the name during implementation. Let users select one or more pills and move them into a group. Update the “My Study Pills” navigation to show groups and pills with distinct icons.
- [x] Redesign the roadmap as a polished, on-theme milestone path with green flags, using the provided roadmap image as inspiration.
- [x] Fix Focus mode so it improves the reading layout without introducing alignment problems.
- [x] Rename “Ask this Pill” to “Got a doubt? 🤔” and choose an icon that fits the existing visual style.
- [x] Improve the reading preferences dialog with useful appearance options, including background choices, and replace the current ad hoc controls with an appropriate accessible UI component library where it helps dialogs and other controls.
- [x] If a component library is added, provide three or four custom color themes from the navbar and apply the selected theme consistently across the dashboard, including buttons and text.
- [x] Add a rotating fact card, preferring science, then basic mathematics, with computer topics rare and history less frequent. Fetch fact summaries and their article links from Wikipedia's REST API. Rotate every six seconds with a smooth flip animation; pause while hovered, highlight the fact on hover, and open its Wikipedia page in a new tab when clicked.
- [x] Show each attached file or YouTube source while a Study Pill is processing, between its title and progress bar.
- [x] Show the total processing time after a Study Pill finishes, in its footer.
- [x] Add a file library where users can find, download, and delete their files. Before deletion, explain that removing a file can break citations in the Study Pills that use it, and identify the affected pills. Also list youtube links they have pasted and map that to the pill.
- [x] Make sure you reset the "Make it yours" and other settings to default in New study pill modal. Currently the previous inputs were persisted when I opened the modal for new pill. Default: Select only Flashcards, Detail level -> balanced and learner level intermediate.
- [x] Can we show an icon for the failed or retry pills?
