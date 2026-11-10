# Backend guide

The FastAPI application and Celery workers live in [`apps/api/`](../apps/api/). Run backend commands from that directory with uv. See the [root README](../README.md) for environment setup, dependencies, and Atlas Vector Search configuration.

## File organization

```text
apps/api/
├── main.py                  # CLI entrypoint; imports src.main.app
├── pyproject.toml           # Dependencies, packaging, lint and test configuration
├── uv.lock
├── src/
│   ├── main.py              # FastAPI lifespan, CORS, and router registration
│   ├── auth/                # Accounts, JWT sessions, Google OAuth, email, local reset
│   ├── pills/               # Pill routes and request/response schemas
│   ├── collections/         # Collection routes and schemas
│   ├── library/             # Attached source listing, downloads, and deletion
│   ├── models/              # Generation catalog route and selection schemas
│   ├── health/              # Dependency status route and response schema
│   ├── common/schemas/      # Shared API, source, citation, and artifact schemas
│   ├── dependencies/        # Verified authenticated user identity
│   ├── services/            # Extraction, pipeline, RAG, chat, export, rendering, 3D
│   ├── generation.py        # Provider catalog, availability checks, and adapters
│   ├── llm.py               # Ollama client and structured-output schemas
│   ├── repository.py        # Pill persistence and serialization
│   ├── database.py          # MongoDB connections and ordinary indexes
│   ├── storage.py           # S3-compatible storage access
│   ├── config.py            # Cached settings loaded from apps/api/.env
│   └── prompts.py           # Shared prompt loader
├── workers/                 # Celery application and processing task
├── tests/                   # Unit tests and HTTP route regression tests
└── evals/                   # Promptfoo suites, Python provider/assertions, prompts
```

Domain routers are registered in `src/main.py` under `/api/v1`. Runtime imports use `src.*` and `workers.*`. `models/` describes generation choices; it is not the shared home for every Pydantic model. Source instances use the single shared `Source` schema in `src/common/schemas/schemas.py`.

## API routes

The local base URL is `http://localhost:8000/api/v1`. FastAPI serves interactive documentation at `/docs` and the generated contract at `/openapi.json`.

| Method | Path relative to `/api/v1` | Behavior |
| --- | --- | --- |
| GET | `/healthz` | MongoDB, object-storage, and Celery worker status |
| GET | `/models` | Generation choices, availability, and unavailability reasons |
| GET | `/pills` | List the current user's Pills |
| POST | `/pills` | Accept multipart files/settings and an optional YouTube URL; queue processing; return 202 |
| GET | `/pills/{pill_id}` | Load a Pill, progress, and saved artifacts |
| PATCH | `/pills/{pill_id}` | Update title, description, tags, or collection membership |
| PATCH | `/pills/bulk/collection` | Move up to 100 Pill IDs to an owned collection, or remove membership |
| GET | `/pills/{pill_id}/three-d` | Return saved scene code for a ready Pill with an available 3D artifact |
| POST | `/pills/{pill_id}/chat` | Answer a question using scoped retrieval and the Pill's saved generation choice |
| POST | `/pills/{pill_id}/retry` | Requeue a failed or ready Pill with its saved sources/settings/model; return 202 |
| POST | `/pills/{pill_id}/export` | Return the ready Pill's Markdown and PNG assets as a ZIP |
| GET | `/collections` | List owned collections |
| POST | `/collections` | Create a collection; return 201 |
| PATCH | `/collections/{collection_id}` | Rename or recolor an owned collection |
| DELETE | `/collections/{collection_id}` | Delete the collection and clear its Pills' membership; return 204 |
| GET | `/library` | List sources attached to the current user's Pills |
| GET | `/library/{source_id}/download` | Authenticated redirect to a presigned original-file URL |
| GET | `/library/{source_id}/download-url` | Return a five-minute signed URL for browser downloads |
| DELETE | `/library/{source_id}` | Delete a stored original and mark it unavailable; retain generated notes |

Pill, collection, library, and model requests require `Authorization: Bearer <access token>`. The API validates the JWT and its active session, then scopes resources by the authenticated user ID. `X-User-Id` is no longer accepted as identity. `/healthz` remains public. See [authentication](authentication.md) for the complete auth API, configuration, and session lifecycle.

JSON uses camelCase names such as `collectionId`, `selectedMaterials`, and `originalAvailable`. Multipart creation fields use snake_case names such as `selected_materials`, `youtube_url`, `generation_provider`, and `generation_model`; `selected_materials` is a JSON-encoded array. MongoDB writes use snake_case. Internal user IDs, object keys, source URLs, and processing settings are excluded from Pill JSON; library entries expose YouTube links separately.

Collection assignment validates ownership. Set `collectionId` to `null` to clear membership. Collection names must be nonempty after trimming and unique per user. YouTube library entries are links, so file download/deletion requests return 409. A deleted original returns 410 for subsequent download/deletion requests.

## Startup and health

`uv run fastapi dev main.py` starts local development; the container runs `uv run fastapi run main.py --host 0.0.0.0 --port 8000`. Startup validates auth configuration, creates MongoDB indexes and ensures the configured storage bucket exists. The Atlas Vector Search index needs separate setup as described in the README.

`GET /api/v1/healthz` checks MongoDB, the bucket, and a Celery inspection ping. It returns `status: "ready"` or `status: "failing"` with a dependency map. Both currently return HTTP 200; inspect the body for readiness. Compose checks this path for an HTTP response. Model and embedding availability are checked by `/models`, separately from health.

The API wheel contains `src/`, `workers/`, `main.py`, and `evals/prompts/`. Docker API and worker services share `Dockerfile.api` and use different startup commands.

## Verification

```bash
uv sync --extra dev
uv run ruff check .
uv run black --check .
uv run pytest
uv build --wheel
```

If Ruff, Black, or pytest is unavailable, run `uv sync --extra dev` in `apps/api/` to install the optional development tools, then rerun the check. Plain `uv sync` does not install this extra.

Unit and route tests mock external services. Auth coverage includes verification/recovery, JWT validation, refresh rotation/replay, revocation, Google linking/state/PKCE, and user isolation. The HTTP regression tests cover file/YouTube creation, collection ownership and persistence, bulk moves and deletion, library operations, model listing, and the health route. Run real ingestion and generation separately with the required services and models available. Promptfoo suites evaluate prompts against live Ollama and are independent of pytest.
