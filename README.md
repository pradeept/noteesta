# Noteesta

Noteesta turns recordings, documents, images, video, and YouTube captions into a source-grounded Study Pill. Each Pill contains readable notes, optional practice materials, controlled visual assets, optional interactive 3D models, portable Markdown export, and chat that stays inside the selected sources.

The implemented vertical slice follows the architecture in [`docs/system-architecture.md`](docs/system-architecture.md). The UI takes its layout and color direction from [`docs/prototypes/grove.html`](docs/prototypes/grove.html).

[`apps/web/`](apps/web/) contains the Next.js frontend. [`apps/api/`](apps/api/) contains FastAPI, Celery workers, and evaluations. The API uses domain modules under `apps/api/src/`: `pills/`, `collections/`, `library/`, `models/`, and `health/` each contain their router and schemas. Shared schemas live in `common/schemas/`; processing services remain in `services/`. See the [backend guide](docs/backend.md) for the file layout, API routes, and storage conventions.

## Toolchain

- Frontend: Next.js, React, Tailwind CSS, and Phosphor icons, managed only with **pnpm**.
- Backend: `fastapi[standard]`, Pydantic, Celery, MongoDB, Redis, and SeaweedFS S3-compatible storage, managed only with **uv**.
- Study Pill generation: personal API keys for OpenAI, Anthropic, Google Gemini, Hugging Face Inference Providers, DeepSeek, and Z.ai/GLM, alongside local Ollama. Settings includes current flagship, balanced, and faster presets. Ollama supplies the separate embedding model for source search.
- Optional 3D generation: the Pill’s resolved generation model prepares a cited spatial brief and generates bounded Three.js code. The scene is stored in MongoDB and rendered in a sandboxed viewer.
- Parsing: Docling for documents and images, faster-whisper `small` for recordings, and yt-dlp for accessible YouTube captions.
- LLM evaluation: Promptfoo suites for section extraction, note synthesis, optional materials, visual specifications, and grounded chat. The providers and assertions are Python files in the backend.

## Local setup

1. Create separate environment files for the frontend and backend. Set the exact model tag returned by `ollama list` in the backend file:

   ```bash
   cp apps/web/.env.example apps/web/.env
   cp apps/api/.env.example apps/api/.env
   ollama list
   ```

2. Install the frontend with pnpm from its app directory. Its package manifest, lockfile, and tool settings live in `apps/web/`:

   ```bash
   cd apps/web
   pnpm install
   cd ../..
   ```

3. Install the backend with uv. The project includes Docling, faster-whisper, and yt-dlp because source ingestion supports documents, recordings, and accessible YouTube captions:

   ```bash
   cd apps/api
   uv sync --extra dev
   cd ../..
   ```

4. With the MongoDB Atlas URI set in `apps/api/.env`, start Redis and SeaweedFS:

   ```bash
   docker compose --env-file apps/api/.env up -d redis seaweedfs
   ```

5. Run each process in its own terminal:

   ```bash
   cd apps/web && pnpm dev
   ```

   ```bash
   cd apps/api && uv run fastapi dev main.py
   ```

   ```bash
   cd apps/api && uv run celery -A workers.celery_app:celery_app worker --loglevel=INFO --pool=solo
   ```

The app is at `http://localhost:3000`, the API docs are at `http://localhost:8000/docs`, and the SeaweedFS S3 endpoint is at `http://localhost:8333`. This setup does not expose an object-storage console; the application creates its configured bucket automatically.

Start Ollama with the configured generation and embedding models available. Every generation provider requires Ollama embeddings. A local generation model is needed only for Ollama generation or missing-key fallback. `GET http://localhost:8000/api/v1/healthz` reports MongoDB, object-storage, and Celery worker connectivity. Inspect its JSON `status` and `dependencies`: a `failing` response currently still uses HTTP 200. Model availability is reported separately by authenticated `GET /api/v1/models`.

The public homepage at `/` explains Noteesta, and `/app` serves the read-only photosynthesis example, including an interactive 3D chloroplast schematic, without API calls. `/llm` is a Markdown product guide for people and agents. To use the development workspace locally, set `NOTEESTA_ENABLE_WORKSPACE=true` in `apps/web/.env`; its dashboard is at `/workspace`, and each live Study Pill opens at `/pills/<id>`. Start signup at `/register`, then open the verification link delivered by the configured email adapter and choose your password. Google accounts using third-party email addresses also require a confirmation email before their first verified sign-in. Email/password and Google sign-in protect the workspace; the public example stays available without signing in. See the [authentication guide](docs/authentication.md) for Google, Resend, session, and caching setup. A ready Pill can be regenerated from its footer to refresh practice questions; this processes its sources again.

Open **Settings** from the account menu at `/settings` to add personal provider keys and save an account-wide default model. The workspace Generation model menu overrides that default for a new Pill. Each Pill retains its requested model for retries and grounded chat; its effective model is recorded separately when generation falls back to Ollama. New Pills created from other views use the account default.

Keys are encrypted in MongoDB and never returned in full. Configure one persistent `PROVIDER_KEYS_ENCRYPTION_KEY` on both API and workers before saving keys. Generate it once with `uv run python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'` from `apps/api`, then store it in `apps/api/.env` (or your deployment secret manager). Back up this key separately from the database. Replacing or losing it makes existing saved provider credentials unreadable; restore it or replace the affected personal keys in Settings. Missing encryption configuration disables hosted-key operations but leaves Ollama usable. Never expose the encryption key through a `NEXT_PUBLIC_*` variable.

Hosted generation credentials are managed exclusively through Settings. A missing personal key falls back to the configured Ollama generation model. Invalid keys, access restrictions, quota errors, provider outages and undecryptable credentials produce explicit errors rather than switching models. In-flight operations may finish using the credential they already resolved; replacement and deletion affect subsequent operations. `GET /api/v1/models` reports account-specific availability. Keep Ollama’s `nomic-embed-text` available for embeddings; hosted generation does not require the local generation model to be installed.

Hosted open models work through their inference APIs; Hugging Face tokens must allow Inference Providers calls. Z.ai uses a standard API key and standard endpoint, not a GLM Coding Plan subscription key. Provider availability and billing depend on the user’s account. Connection testing sends a small synthetic JSON request, never study sources, and may incur a small provider charge. Study generation and chat send selected source text to the chosen provider. See [preset comparison guidance](apps/api/evals/README.md) for model sources and live evaluation instructions.

The official public origin is `https://noteesta.com`. `NOTEESTA_SITE_URL` defaults to that origin for canonical metadata, robots.txt, sitemap.xml, and llms.txt. Set a different origin before building a preview deployment. The API requires a Noteesta access bearer token for private resources, including model discovery. Production requires a stable `JWT_SECRET`, HTTPS, exact credentialed CORS origins, and Resend configuration. The local Compose setup binds the API port to loopback.

You can also build the API, worker, and frontend with `docker compose --env-file apps/web/.env --env-file apps/api/.env up --build`. Compose does not start MongoDB; API and worker connect to the `MONGODB_URI` supplied by `apps/api/.env`. API and worker containers read `apps/api/.env`. The web image receives public frontend settings as build arguments and the workspace flag at runtime. Ollama remains on the host by default and the containers use `OLLAMA_DOCKER_BASE_URL` from the backend environment file. For Vercel, set the project's Root Directory to `apps/web`.

`Dockerfile.api` copies `apps/api/main.py`, `src/`, `workers/`, and the shared prompt files, then starts `fastapi run main.py`. The worker uses the same image with the Celery command. To validate Compose without starting services, run `docker compose --env-file apps/web/.env --env-file apps/api/.env config --quiet`.

## Environment

The environment files are kept separate: [`apps/web/.env.example`](apps/web/.env.example) contains frontend variables, and [`apps/api/.env.example`](apps/api/.env.example) contains FastAPI, worker, storage, model, and Promptfoo variables. Next.js reads `apps/web/.env`; FastAPI reads `apps/api/.env` regardless of its current working directory.

The backend values most likely to change are:

- `OLLAMA_MODEL`: exact Qwen tag, such as `qwen3-vl:8b-instruct`.
- `OLLAMA_EMBEDDING_MODEL`: embedding model, default `nomic-embed-text`.
- `OLLAMA_BASE_URL`: host used by local API and Promptfoo processes.
- `OLLAMA_DOCKER_BASE_URL`: host used by the API and worker containers.
- `PROVIDER_KEYS_ENCRYPTION_KEY`: persistent Fernet key, shared by API and workers, required for personal hosted-provider credentials.
- Personal provider keys are managed through Settings, rather than backend environment variables. Optional `EVAL_*` credentials are separate and used only for explicitly run live evaluations.
- `JWT_SECRET`: stable secret of at least 32 characters; generate one with `openssl rand -hex 32`.
- `WEB_URL` and `CORS_ORIGINS`: frontend origin, including the development port.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`: optional Google OAuth setup.
- `EMAIL_ADAPTER`: `local` for private development previews in `apps/api/.local/emails/`, or `resend` with `RESEND_API_KEY` and `EMAIL_FROM` for real delivery. Local preview paths are relative to the API process working directory.

Generated 3D JavaScript and its cited handoff are stored in the `pill_three_d` MongoDB collection under the Pill ID. The Pill document stores only the 3D status, description, and citations. The owner-scoped `GET /api/v1/pills/{pill_id}/three-d` route loads the code when the 3D tab opens. The public example uses a bundled scene and does not call OpenAI. ZIP export does not include interactive models.

## Promptfoo evals

The evals live under [`apps/api/evals`](apps/api/evals) with Python providers and Python assertions. They load the same shared prompt files used by the backend and run serially because local multimodal models can consume substantial memory.

Promptfoo's runner is a Node CLI, but it is not a frontend dependency or package script. Use its one-off pnpm runner with the backend's uv interpreter:

```bash
PROMPTFOO_PYTHON="$(cd apps/api && uv run python -c 'import sys; print(sys.executable)')" \
  pnpm dlx promptfoo@0.123.1 eval -c apps/api/evals/sections.yaml --env-file apps/api/.env -j 1
```

Replace `sections.yaml` with `notes.yaml`, `materials.yaml`, `visuals.yaml`, or `chat.yaml` to run another required job. The Python provider uses the same structured adapters as production. It defaults to `OLLAMA_MODEL`; set `EVAL_PROVIDER`, `EVAL_MODEL`, and the corresponding `EVAL_*` key for a hosted preset. Qwen reasoning is disabled. The [comparison guide](apps/api/evals/README.md) generates matrices against the local baseline without exporting account keys.

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
cd apps/web
pnpm lint
pnpm typecheck
pnpm test
pnpm build

cd ../api
uv run ruff check .
uv run black --check .
uv run pytest
```

Black formats backend Python files with `cd apps/api && uv run black .`; Ruff remains the lint checker.

If Ruff, Black, or pytest is unavailable (for example, `Failed to spawn: ruff`), run `uv sync --extra dev` in `apps/api/` to install the optional development tools, then rerun the check. Plain `uv sync` does not install this extra.

Backend unit and route tests mock external services; running them does not verify live MongoDB, Redis, object storage, Ollama, or provider credentials. Promptfoo evaluations make real model calls and run separately. From `apps/web/`, `pnpm verify` runs all four frontend checks above. Use `pnpm format` or `pnpm format:check` there to format or check frontend files.

To verify API packaging, run `cd apps/api && uv build --wheel`. The wheel includes `src/`, `workers/`, the `main.py` entrypoint, and `evals/prompts/`.

## Current limits

New Pills accept file uploads and an optional YouTube URL. The source library lists attached files and links, supports original-file downloads and deletion, and preserves generated notes after an original is deleted. Reusing a library file in a new Pill is not implemented. Regeneration needs the original files to remain available.

Uploaded audio and video are transcribed; video frames and slides are not currently sampled. YouTube ingestion fetches accessible English captions, including automatic captions, and fails when none are available. Export returns a ZIP containing `notes.md` with the generated study materials and an `assets/` directory for PNG visuals; original files and interactive 3D models are excluded.

The [original hackathon plan](plan.md), [design diagrams](docs/diagrams.html), and [HTML prototypes](docs/prototypes/README.md) retain proposed behavior that may differ from the implementation. Use this README and the [current architecture guide](docs/system-architecture.md) for setup and implemented behavior.

## Atlas Vector Search setup

LangChain provides source chunking, Ollama embeddings, structured generation, and retrieval through MongoDB Atlas Vector Search. The API stores chunks in `noteesta.chunks`; Atlas filters each vector query by the top-level `user_id` and `pill_id` metadata fields.

For Atlas, create the `noteesta` database and `chunks` collection, then add a Vector Search index named `vector_index` with this definition. The 768 dimensions correspond to the default `nomic-embed-text` configuration. If you change the embedding model or its output dimensions, update the index definition and regenerate affected Pills to rebuild their chunks.

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

