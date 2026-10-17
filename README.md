# Noteesta

Noteesta turns recordings, documents, images, video, and YouTube captions into a source-grounded Study Pill. Each Pill contains readable notes, optional practice materials, controlled visual assets, optional interactive 3D models, portable Markdown export, and chat that stays inside the selected sources.

The implemented vertical slice follows the architecture in [`docs/system-architecture.md`](docs/system-architecture.md). The UI takes its layout and color direction from [`docs/prototypes/grove.html`](docs/prototypes/grove.html).

The workspace follows the same layout as Wildmon: [`apps/web/`](apps/web/) contains the Next.js site and [`apps/api/`](apps/api/) contains FastAPI, Celery, and evaluations. Frontend source lives under `apps/web/src/`; repository-level pnpm commands run the web package.

## Toolchain

- Frontend: Next.js, React, Tailwind CSS, and Phosphor icons, managed only with **pnpm**.
- Backend: `fastapi[standard]`, Pydantic, Celery, MongoDB, Redis, and SeaweedFS S3-compatible storage, managed only with **uv**.
- Local inference: Ollama with Qwen and a separate Ollama embedding model.
- Optional 3D generation: Qwen prepares a cited spatial brief; OpenAI GPT-5.4 generates a bounded Three.js scene. The scene is stored in MongoDB and rendered in a sandboxed viewer.
- Parsing: Docling for documents and images, faster-whisper `small` for recordings, and yt-dlp for accessible YouTube captions.
- LLM evaluation: Promptfoo suites for section extraction, note synthesis, optional materials, visual specifications, and grounded chat. The providers and assertions are Python files in the backend.

## Local setup

1. Create separate environment files for the frontend and backend. Set the exact model tag returned by `ollama list` in the backend file:

   ```bash
   cp apps/web/.env.example apps/web/.env
   cp apps/api/.env.example apps/api/.env
   ollama list
   ```

2. Install the frontend with pnpm:

   ```bash
   pnpm install
   ```

3. Install the backend with uv. The project includes Docling, faster-whisper, and yt-dlp because source ingestion supports documents, recordings, and accessible YouTube captions:

   ```bash
   cd apps/api
   uv sync --extra dev
   cd ..
   ```

4. With the MongoDB Atlas URI set in `apps/api/.env`, start Redis and SeaweedFS:

   ```bash
   docker compose --env-file apps/api/.env up -d redis seaweedfs
   ```

5. Run each process in its own terminal:

   ```bash
   pnpm dev
   ```

   ```bash
   cd apps/api && uv run fastapi dev noteesta_api/main.py
   ```

   ```bash
   cd apps/api && uv run celery -A workers.celery_app:celery_app worker --loglevel=INFO --pool=solo
   ```

The app is at `http://localhost:3000`, the API docs are at `http://localhost:8000/docs`, and the SeaweedFS S3 endpoint is at `http://localhost:8333`. This setup does not expose an object-storage console; the application creates its configured bucket automatically.

The public homepage at `/` explains Noteesta, and `/app` serves the read-only photosynthesis example, including an interactive 3D chloroplast schematic, without API calls. `/llm` is a Markdown product guide for people and agents. To use the development workspace locally, set `NOTEESTA_ENABLE_WORKSPACE=true` in `apps/web/.env`; its dashboard is at `/workspace`, and each live Study Pill opens at `/pills/<id>`. Keep this setting off in public deployments until real authentication and authorization are in place. A ready Pill can be regenerated from its footer to refresh practice questions; this processes its sources again.

The official public origin is `https://noteesta.com`. `NOTEESTA_SITE_URL` defaults to that origin for canonical metadata, robots.txt, sitemap.xml, and llms.txt. Set a different origin before building a preview deployment. The FastAPI service currently trusts a caller-provided user ID; do not expose it as a public service without replacing that mechanism with real authentication. The local Compose setup binds the API port to loopback for this reason.

You can also build the API, worker, and frontend with `docker compose --env-file apps/web/.env --env-file apps/api/.env up --build`. Compose does not start MongoDB; API and worker connect to the `MONGODB_URI` supplied by `apps/api/.env`. API and worker containers read `apps/api/.env`; Next.js reads `apps/web/.env`. Ollama remains on the host by default and the containers use `OLLAMA_DOCKER_BASE_URL` from the backend environment file. For Vercel, set the project's Root Directory to `apps/web`.

## Environment

The environment files are kept separate: [`apps/web/.env.example`](apps/web/.env.example) contains frontend variables, and [`apps/api/.env.example`](apps/api/.env.example) contains FastAPI, worker, storage, model, and Promptfoo variables. Next.js reads `apps/web/.env`; FastAPI reads `apps/api/.env` regardless of its current working directory.

The backend values most likely to change are:

- `OLLAMA_MODEL`: exact Qwen tag, such as `qwen3-vl:8b-instruct`.
- `OLLAMA_EMBEDDING_MODEL`: embedding model, default `nomic-embed-text`.
- `OLLAMA_BASE_URL`: host used by local API and Promptfoo processes.
- `OLLAMA_DOCKER_BASE_URL`: host used by the API and worker containers.
- `OPENAI_API_KEY`: required when Interactive 3D is selected for a live Pill. The rest of the Pill remains available if 3D generation fails or the source material does not support a spatial model.
- `OPENAI_3D_MODEL`: OpenAI model used for scene code, default `gpt-5.4`.
- `ALLOW_DEMO_USER`: permits the `demo-user` development identity. Disable this when real authentication is connected.

Generated 3D JavaScript and its Qwen handoff are stored in the `pill_three_d` MongoDB collection under the Pill ID. The Pill document stores only the 3D status, description, and citations. The owner-scoped `GET /api/v1/pills/{pill_id}/three-d` route loads the code when the 3D tab opens. The public example uses a bundled scene and does not call OpenAI. ZIP export does not include interactive models.

## Promptfoo evals

The evals live under [`apps/api/evals`](apps/api/evals) with Python providers and Python assertions. They load the same shared prompt files used by the backend and run serially because local multimodal models can consume substantial memory.

Promptfoo's runner is a Node CLI, but it is not a frontend dependency or package script. Use its one-off pnpm runner with the backend's uv interpreter:

```bash
PROMPTFOO_PYTHON="$(cd apps/api && uv run python -c 'import sys; print(sys.executable)')" \
  pnpm dlx promptfoo@0.123.1 eval -c apps/api/evals/sections.yaml --env-file apps/api/.env -j 1
```

Replace `sections.yaml` with `notes.yaml`, `materials.yaml`, `visuals.yaml`, or `chat.yaml` to run another required job. The Python provider reads `OLLAMA_BASE_URL` and `OLLAMA_MODEL`; Qwen reasoning is disabled for these structured-output jobs so assertions receive only final JSON.

The materials suite checks the MCQ target for concise notes (two questions) and fuller notes (five distinct questions), including source evidence for each answer.

Run all suites sequentially:

```bash
for config in sections notes materials visuals chat; do
  PROMPTFOO_PYTHON="$(cd apps/api && uv run python -c 'import sys; print(sys.executable)')" \
    pnpm dlx promptfoo@0.123.1 eval -c "apps/api/evals/${config}.yaml" --env-file apps/api/.env -j 1 || exit 1
done
```

## Verification

```bash
pnpm lint:web
pnpm typecheck
pnpm test
pnpm build:web

cd apps/api
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

