<div align="center">
  <img src="apps/web/src/app/icon.svg" alt="Noteesta logo" width="64" height="64" />
  <h1>Noteesta</h1>
  <p><strong>Make sense of what you study.</strong></p>
  <p>An open-source alternative to Turbo AI and Google NotebookLM.<br />Self-host your study workspace with local Ollama or bring your own API keys.</p>
  <p>
    <a href="https://noteesta.com">Website</a> ·
    <a href="#docker">Docker Compose</a> ·
    <a href="#local-setup">Local development</a> ·
    <a href="#documentation">Documentation</a> ·
    <a href="apps/site/content/changelog.md">Changelog</a> ·
    <a href="https://github.com/pradeept/noteesta/issues">Issues</a>
  </p>
</div>

[Watch the 43-second Noteesta video](https://noteesta.com/media/noteesta-intro.mp4)

## What is Noteesta?

A lesson can be spread across a recording, slides, handwritten notes, and a video. Noteesta brings those sources into a **Study Pill**: a structured explanation you can read, check against its sources, edit, and revisit when studying.

Self-host the workspace for your own materials, or [explore the interactive sample](https://noteesta.com/app) without an account. The public sample uses bundled content; uploads and preparation are simulated.

## Features

| Feature                   | What you can do                                                                                                   |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Source-linked notes**   | Combine documents, images, audio, video, and accessible YouTube captions into notes with references and excerpts. |
| **In-place editing**      | Format and highlight notes, save automatically, and preview or restore earlier versions.                          |
| **Practice**              | Choose flashcards, multiple-choice and true-or-false questions, and a study roadmap.                              |
| **Visual learning**       | Explore flow visuals and optional interactive 3D concept models.                                                  |
| **Local models and BYOK** | Generate with Ollama or personal keys for OpenAI, Anthropic, Gemini, Hugging Face, DeepSeek, and Z.ai.            |
| **Private workspaces**    | Sign in with email/password or Google; keep each account’s Pills, collections, and sources separate.              |
| **Chat and export**       | Ask questions within a Pill’s sources and download Markdown notes with PNG visuals.                               |

## Getting started

Choose [Docker Compose](#docker) to run the application in containers, or [local development](#local-setup) to work on the frontend and backend with live reload. Both paths use the preparation below.

### Prerequisites

- **Docker with Compose** for the full stack or just Redis and object storage.
- **MongoDB Atlas** with a database user, network access configured for your API and worker, and an [Atlas Vector Search index](docs/self-hosting.md#atlas-vector-search). MongoDB is not included in Compose. A plain local MongoDB instance does not provide the vector-search setup used by grounded chat.
- **[Ollama](https://ollama.com/download)** for embeddings with every generation provider. Local generation also needs the configured generation model.
- **Git and OpenSSL** for cloning and generating configuration secrets.
- For local development: **Node.js 24**, **pnpm 11.8.0**, **Python 3.11+**, and **[uv](https://docs.astral.sh/uv/getting-started/installation/)**. The Docker images use Node.js 24 and Python 3.12; host Node.js, pnpm, Python, and uv are not needed for the Compose path.

### 1. Clone the repository

```bash
git clone https://github.com/pradeept/noteesta.git
cd noteesta
```

Commands use Bash/zsh (or WSL on Windows) and start from the repository root unless a different directory is shown.

### 2. Configure the environment

```bash
cp apps/web/.env.example apps/web/.env
cp apps/api/.env.example apps/api/.env
```

For hosted AI provider keys (BYOK), generate an encryption key and paste it into the backend environment file. Local Ollama needs no auth secrets:

```bash
# PROVIDER_KEYS_ENCRYPTION_KEY — required for BYOK
openssl rand -base64 32 | tr '/+' '_-'
```

In **`apps/web/.env`**, set the browser-facing API URL:

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
```

In **`apps/api/.env`**, replace these values; keep the remaining example defaults for a local setup:

```dotenv
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>/?retryWrites=true&w=majority
NOTEESTA_AUTH_ENABLED=false
PROVIDER_KEYS_ENCRYPTION_KEY=<paste-the-generated-encryption-key>
WEB_URL=http://localhost:3000
CORS_ORIGINS=http://localhost:3000
EMAIL_ADAPTER=local
```

Use your Atlas connection string and URL-encode special characters in its username/password. Keep the encryption key stable; losing it makes existing saved provider keys unreadable. See [environment settings](#environment) and the [self-hosting guide](docs/self-hosting.md) for details.

### 3. Prepare Ollama and MongoDB

With Ollama running, pull the embedding model and, if using local generation, the default generation model:

```bash
ollama pull nomic-embed-text
ollama pull qwen3-vl:8b-instruct
ollama list
```

Set `OLLAMA_MODEL` in `apps/api/.env` to the exact installed generation-model tag. If you intend to use only BYOK, you can skip the local generation-model download; add a provider key and choose its model in Settings before creating your first Pill. **Ollama embeddings are still required.**

Create the [Atlas Vector Search index](docs/self-hosting.md#atlas-vector-search) on `noteesta.chunks` and wait for it to be ready before using grounded chat.

## Docker

**Runs:** frontend, API, Celery worker, Redis, and SeaweedFS object storage. **Connects separately to:** your MongoDB deployment and host Ollama.

Complete [Getting started](#getting-started) first. Keep these backend settings for host Ollama:

```dotenv
OLLAMA_DOCKER_BASE_URL=http://host.docker.internal:11434
```

Ollama must listen on an address reachable from Docker. For a manually started Ollama server, use this in a separate terminal:

```bash
OLLAMA_HOST=0.0.0.0:11434 ollama serve
```

If Ollama already runs as an app or service, configure its bind address and restart that instance instead of starting a second server. See [Ollama’s platform-specific instructions](https://docs.ollama.com/faq#how-do-i-configure-ollama-server). Keep this endpoint reachable only by trusted clients.

Build and start Noteesta:

```bash
docker compose --env-file apps/web/.env --env-file apps/api/.env up -d --build
```

Open **[localhost:3000](http://localhost:3000)**. Your local workspace opens immediately; account setup is optional.

Useful commands, from the repository root:

```bash
# Check services and follow application logs
docker compose --env-file apps/web/.env --env-file apps/api/.env ps
docker compose --env-file apps/web/.env --env-file apps/api/.env logs -f api worker

# Validate configuration without starting services
docker compose --env-file apps/web/.env --env-file apps/api/.env config --quiet

# Stop the stack, keeping the object-storage volume
docker compose --env-file apps/web/.env --env-file apps/api/.env down
```

Compose configures container-to-container Redis and storage URLs automatically. Do not change those to `localhost`. The first build and first document/transcription job can take longer while dependencies and model weights download.

This is a local self-hosting configuration. For a public deployment, follow the [deployment settings](docs/self-hosting.md#public-deployments).

## Local setup (development)

Complete [Getting started](#getting-started), then install dependencies. Use **pnpm** for the frontend and **uv** for Python.

```bash
cd apps/web
corepack enable
pnpm install --frozen-lockfile
cd ../api
uv sync --extra dev
cd ../..
```

Start Redis and SeaweedFS in Docker, leaving the app processes on your host:

```bash
docker compose --env-file apps/web/.env --env-file apps/api/.env up -d redis seaweedfs
```

The backend example defaults already point to host-accessible Redis, storage, and Ollama endpoints. Keep Ollama running, then open **three terminals**, each starting at the repository root:

| Terminal | Process                                            |
| -------- | -------------------------------------------------- |
| 1        | Next.js frontend with live reload                  |
| 2        | FastAPI with live reload                           |
| 3        | Celery worker for source processing and generation |

```bash
# Terminal 1
cd apps/web
pnpm dev
```

```bash
# Terminal 2
cd apps/api
uv run fastapi dev main.py
```

```bash
# Terminal 3 — solo pool also works for local development on macOS/Windows
cd apps/api
uv run celery -A workers.celery_app:celery_app worker --loglevel=INFO --pool=solo
```

Open **[localhost:3000](http://localhost:3000)** to open your local workspace (no account needed). Restart the API and worker after changing backend environment values.

### Local endpoints

| Service                        | Address                                                               |
| ------------------------------ | --------------------------------------------------------------------- |
| Workspace                       | [localhost:3000](http://localhost:3000)                               |
| Your workspace                 | [localhost:3000/workspace](http://localhost:3000/workspace)           |
| Interactive sample             | [noteesta.com/app](https://noteesta.com/app) |
| API documentation              | [localhost:8000/docs](http://localhost:8000/docs)                     |
| Dependency health              | [localhost:8000/api/v1/healthz](http://localhost:8000/api/v1/healthz) |
| S3-compatible storage endpoint | `http://localhost:8333` — API endpoint, not a web console             |

Use `localhost` consistently; changing to `127.0.0.1` also requires matching frontend origin, CORS, and authentication settings. If port 3000 is busy, free it before starting the frontend or update all origin settings together.

## Create an account

Optional: set `NOTEESTA_AUTH_ENABLED=true` and configure a stable `JWT_SECRET` first. See [authentication](docs/authentication.md) for production email and HTTPS requirements.

1. Open [localhost:3000/register](http://localhost:3000/register) and enter your name and email.
2. With `EMAIL_ADAPTER=local`, find the verification URL in the generated email JSON:
   - **Local development:** `apps/api/.local/emails/`.
   - **Docker Compose:** read the preview inside the API container:

   ```bash
   docker compose --env-file apps/web/.env --env-file apps/api/.env exec api sh -c 'cat .local/emails/*.json'
   ```

3. Open the verification URL, choose your password, and sign in. The workspace is at `/workspace`.

The local adapter writes previews instead of sending email. For Google sign-in or real email delivery through Resend, see the [authentication guide](docs/authentication.md).

## Environment

There is no shared root `.env` file. Copy and edit both app templates:

| Template                                                           | Used by                                                              |
| ------------------------------------------------------------------ | -------------------------------------------------------------------- |
| [`apps/web/.env.example`](apps/web/.env.example) → `apps/web/.env` | Product frontend; Compose frontend build arguments |
| [`apps/api/.env.example`](apps/api/.env.example) → `apps/api/.env` | FastAPI, Celery, storage, generation, and optional evaluations       |

| Setting                                  | Purpose                                                                                        |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `NOTEESTA_AUTH_ENABLED` | Backend auth mode. Local example and Compose default to `false`; backend default is `true`. |
| `NEXT_PUBLIC_API_URL`                    | Browser-facing API URL; `http://localhost:8000/api/v1` locally. Baked into the frontend build. |
| `NOTEESTA_SITE_URL`                      | Website origin for canonical metadata, sitemap, and LLM guides. Set before building.           |
| `MONGODB_URI`                            | Connection string reachable by both API and worker; Compose does not start MongoDB.            |
| `JWT_SECRET`                             | Stable authentication secret shared across API processes.                                      |
| `PROVIDER_KEYS_ENCRYPTION_KEY`           | One persistent Fernet key shared by API and workers; required for BYOK.                        |
| `WEB_URL`, `CORS_ORIGINS`                | Exact frontend origin, including scheme and port.                                              |
| `OLLAMA_BASE_URL`                        | Ollama endpoint when API/worker run on the host.                                               |
| `OLLAMA_DOCKER_BASE_URL`                 | Host Ollama endpoint used by API/worker containers.                                            |
| `OLLAMA_MODEL`, `OLLAMA_EMBEDDING_MODEL` | Generation model and separate embedding model.                                                 |
| `EMAIL_ADAPTER`                          | `local` for development previews; `resend` for delivered email.                                |

Full defaults, optional Google/Resend settings, and evaluation credentials are documented in the templates. For storage, encryption-key recovery, deployment, and connectivity details, see [self-hosting](docs/self-hosting.md).

## Models and BYOK

Open **Settings** from your account menu to add a personal API key and select a default generation model. Noteesta supports **OpenAI, Anthropic, Google Gemini, Hugging Face Inference Providers, DeepSeek, and Z.ai**, alongside **Ollama**.

The model menu overrides your default for a new Pill. Each Pill retains its chosen model for retries and chat. Personal keys are encrypted in MongoDB and are never returned in full. Source text goes to the selected generation provider; provider usage is billed to your account.

Missing personal keys fall back to the configured Ollama generation model. Invalid keys, quota errors, provider outages, and unreadable stored credentials return errors instead of silently switching providers. Keep Ollama’s embedding model available with every provider. See [provider configuration](docs/self-hosting.md#provider-keys-and-model-selection) for details.

## Documentation

| Guide                                         | Covers                                                                     |
| --------------------------------------------- | -------------------------------------------------------------------------- |
| [Self-hosting](docs/self-hosting.md)          | MongoDB vector index, storage, model settings, deployment, and diagnostics |
| [Architecture](docs/system-architecture.md)   | Services, processing pipeline, data ownership, and current boundaries      |
| [Backend](docs/backend.md)                    | Python layout, API routes, and packaging                                   |
| [Authentication](docs/authentication.md)      | Email verification, Google, Resend, sessions, and local setup              |
| [Note editing](docs/note-editing.md)          | Autosave, formatting, citations, and version history                       |
| [Model evaluations](apps/api/evals/README.md) | Live preset comparisons and evaluation credentials                         |
| [Documentation index](docs/README.md)         | Design diagrams and additional project references                          |

### Repository layout

```text
apps/site/       Public website and interactive demo (independent deployment)
apps/web/        Learning workspace
apps/api/        FastAPI service, Celery workers, and model evaluations
docs/            Setup, architecture, and product guides
compose.yaml     Local self-hosting services
```

## Contributing

Bug reports, documentation fixes, and focused pull requests are welcome.

1. [Open an issue](https://github.com/pradeept/noteesta/issues) with reproduction steps, expected behavior, and relevant logs with credentials removed. For a larger change, discuss the approach first.
2. Fork the repository, create a branch, and follow [local setup](#local-setup).
3. Run the relevant [checks](#verification), update documentation for behavior changes, and open a pull request describing the change and how you verified it.

### Verification

Frontend, from `apps/web`:

```bash
pnpm verify
pnpm format:check
```

Backend, from `apps/api`:

```bash
uv sync --extra dev
uv run ruff check .
uv run black --check .
uv run pytest
```

`pnpm verify` runs lint, TypeScript, unit tests, and the production build. Backend tests mock external services; they do not verify live infrastructure or provider access. For browser checks, install Chromium with `pnpm exec playwright install chromium`, then run `pnpm test:e2e` from `apps/web`. Browser tests use a separate frontend on port 3100.

Optional live generation evaluations and package-build checks are in the [self-hosting and development notes](docs/self-hosting.md#development-checks).

## Changelog

See [the changelog](apps/site/content/changelog.md) for authentication, in-place editing, BYOK, and other updates. This Markdown file also renders in the landing page’s collapsed Changelog.

Add entries under `Unreleased`, then move them to a dated heading when released. Rebuild and deploy the web app to publish the updated notes; no component changes are required.

## Current limits

- YouTube imports support video watch links and share links. They need accessible English captions. Noteesta prefers regular captions and shows a warning when it uses automatic captions. Add slides or screenshots separately to cover details shown only on screen.
- The source library supports downloading and deleting originals. Reusing a library file in a new Pill is not implemented; regeneration needs the originals to remain available.
- ZIP exports contain `notes.md`, practice materials, and PNG visuals. Original uploads and interactive 3D models are excluded.
- The public sample has no real uploads, backend calls, or saved progress. Use your self-hosted workspace for your own materials.

The [original hackathon plan](docs/plan.md) and [HTML prototypes](docs/prototypes/README.md) preserve proposed behavior; the implementation and current architecture guide describe what is available today.

## Troubleshooting

| Symptom                   | What to check                                                                                                                                |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace is unavailable | Check API connectivity and `/api/v1/config`; the product workspace is always enabled. |
| MongoDB fails in Docker   | Container `localhost` is not your host. Use a reachable Atlas connection string and allow the API/worker’s outbound address in Atlas.        |
| Ollama connection refused | Check the installed models, bind address, and `OLLAMA_DOCKER_BASE_URL`; see [Ollama connectivity](docs/self-hosting.md#ollama-connectivity). |
| Pill stays queued         | Confirm the Celery worker is running and can reach Redis, MongoDB, storage, and Ollama.                                                      |
| No verification email     | The default `local` adapter writes JSON previews. Check the host folder or API container described [above](#create-an-account).              |
| Chat cannot find sources  | Check the Atlas vector index name, readiness, 768 dimensions, and both filter fields.                                                        |
| BYOK is unavailable       | Set the same persistent encryption key for API and worker, restart them, and add your personal key in Settings.                              |

For project questions, [open an issue](https://github.com/pradeept/noteesta/issues) or email [contact@noteesta.com](mailto:contact@noteesta.com).

## License

[MIT](LICENSE). You can use, modify, publish, distribute, sublicense, and sell copies, including commercially. Keep the copyright and license notice with copies or substantial portions of the software.

## Public website deployment

The landing page and bundled interactive demo live in `apps/site`. Run `pnpm install` and `pnpm dev` there; no backend services or auth configuration are needed. Set `NOTEESTA_SITE_URL` before building. For noteesta.com on Vercel, change the project Root Directory to `apps/site`. The product Compose stack does not include this website.

See [deployment modes](docs/deployment-modes.md) for local ownership, switching auth on, and deployment configuration.
