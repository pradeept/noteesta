
## Local setup (development)

Install **Git**, **Node.js 24**, **pnpm 11.8.0**, **Python 3.11+**, and **[uv](https://docs.astral.sh/uv/getting-started/installation/)**. Set up [MongoDB Atlas](docs/self-hosting.md#atlas-vector-search) and [pull the models into host Ollama](#use-ollama-running-on-your-host).

```bash
git clone https://github.com/pradeept/noteesta.git
cd noteesta
```

From the repository root, run `sh setup.sh` to generate the `.env` files and secrets. Set `MONGODB_URI` in `apps/api/.env` to your Atlas connection string. Then install the frontend and backend dependencies.

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
| [`apps/web/.env.example`](apps/web/.env.example) → `apps/web/.env` | Local frontend development and source-build settings; prebuilt images use localhost |
| [`apps/api/.env.example`](apps/api/.env.example) → `apps/api/.env` | FastAPI, Celery, storage, generation, and optional evaluations |

| Setting                                  | Purpose                                                                                        |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `NOTEESTA_AUTH_ENABLED` | Backend auth mode. Local example and Compose default to `false`; backend default is `true`. |
| `NEXT_PUBLIC_API_URL`                    | Browser-facing API URL for frontend development/source builds. Published images use `http://localhost:8000/api/v1`; changing a downloaded container's environment does not change it. |
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

## Documentation

| Guide                                         | Covers                                                                     |
| --------------------------------------------- | -------------------------------------------------------------------------- |
| [Self-hosting](docs/self-hosting.md)          | MongoDB vector index, storage, model settings, deployment, and diagnostics |
| [Architecture](docs/system-architecture.md)   | Services, processing pipeline, data ownership, and current boundaries      |
| [Backend](docs/backend.md)                    | Python layout, API routes, and packaging                                   |
| [Authentication](docs/authentication.md)      | Email verification, Google, Resend, sessions, and local setup              |
| [Note editing](docs/note-editing.md)          | Autosave, formatting, citations, and version history                       |
| [Website sources](docs/website-sources.md) | Page selection, saved text, failed imports, and website limits |
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

- Paste a YouTube watch or share link to add a video to a Study Pill. YouTube Shorts are unsupported.
- Paste public HTML links and review directly linked pages on the same website. Website imports do not run JavaScript or sign in; regeneration reuses saved text.
- The source library supports downloading and deleting originals. Reusing a library file in a new Pill is not implemented; regeneration needs the originals to remain available.
- ZIP exports contain `notes.md`, practice materials, and PNG visuals. Original uploads and interactive 3D models are excluded.
- The public sample has no real uploads, backend calls, or saved progress. Use your self-hosted workspace for your own materials.

The [original hackathon plan](docs/plan.md) and [HTML prototypes](docs/prototypes/README.md) preserve proposed behavior; the implementation and current architecture guide describe what is available today.