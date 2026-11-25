# Self-hosting and development notes

Start with the [Docker Compose](../README.md#docker) or [local development](../README.md#local-setup) instructions in the README. This guide covers infrastructure, provider settings, and operational details.

## Compose images and updates

Compose pulls `pradeept17/noteesta-web:latest` for the frontend and `pradeept17/noteesta-api:latest` for the API and worker. Public pulls require no Docker Hub login.

Follow the [Docker setup](../README.md#docker) for the Compose file you use. Run its start command again to pull updates and recreate services whose images changed.

Published web images use `http://localhost:8000/api/v1`, so open the frontend on the same machine as the API. `NEXT_PUBLIC_API_URL` in `apps/web/.env` applies to frontend development and source builds.

## Atlas Vector Search

Create an Atlas deployment, database user, and network access entry for the API and worker. Put its connection string in `MONGODB_URI` in `apps/api/.env`. Wait for the vector index to be ready before using grounded chat.

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

## Ollama connectivity

Ollama provides source embeddings for **every** generation provider. Local generation or missing-key fallback also needs the configured `OLLAMA_MODEL` installed.

| Setup | Ollama endpoint |
| ----- | --------------- |
| Local development | `OLLAMA_BASE_URL=http://127.0.0.1:11434` |
| `compose.yaml` with host Ollama | `OLLAMA_DOCKER_BASE_URL=http://host.docker.internal:11434` |
| `compose.ollama.yaml` with containerized Ollama | `http://ollama:11434` on the Compose network |

Use the exact installed generation tag in `OLLAMA_MODEL`. `OLLAMA_NUM_CTX` configures the local model context; `OLLAMA_TIMEOUT_SECONDS` controls the request timeout. Model availability is also exposed by authenticated `GET /api/v1/models`.

### Ollama in Compose

[`compose.ollama.yaml`](../compose.ollama.yaml) defines the full Noteesta stack with the official Ollama image. Use [the containerized Ollama setup](../README.md#run-ollama-with-noteesta-in-docker) to start the stack and download models into the persistent `ollama-data` volume. This setup uses CPU by default. See the [Ollama Docker guide](https://docs.ollama.com/docker) for GPU setup.

### Debug host Ollama on Linux

For `compose.yaml` with Ollama running on the host, check its listen address with `ss -ltn 'sport = :11434'`. A listener on `127.0.0.1:11434` only accepts connections from the host. Docker needs a listener on an address it can reach.

If Ollama runs as a systemd service and listens only on loopback, run `sudo systemctl edit ollama.service`. Add the following in the editable area above the line that says subsequent lines will be discarded. Restrict access to port 11434 to trusted clients when listening on all interfaces. See the [Ollama configuration guide](https://docs.ollama.com/faq#setting-environment-variables-on-linux) and the [systemctl manual](https://www.freedesktop.org/software/systemd/man/latest/systemctl.html#edit%20UNIT%E2%80%A6).

```ini
[Service]
Environment="OLLAMA_HOST=0.0.0.0:11434"
```

After saving, run `systemctl cat ollama.service` and confirm the `OLLAMA_HOST` setting appears in the saved `override.conf`. Run `sudo systemctl daemon-reload` and `sudo systemctl restart ollama.service`, then check the listen address again.

From the repository root, test the endpoint configured inside the API container. HTTP 200 confirms the API container can reach Ollama.

```bash
docker compose --env-file apps/web/.env --env-file apps/api/.env exec -T api python - <<'PY'
import os
from urllib.request import ProxyHandler, build_opener

url = os.environ["OLLAMA_BASE_URL"].rstrip("/") + "/api/tags"
with build_opener(ProxyHandler({})).open(url, timeout=3) as response:
    print(response.status)
PY
```

## Provider keys and model selection

Open **Settings** from the account menu at `/settings` to add personal provider keys and save an account-wide default model. Changing the workspace Generation model menu also saves that choice to MongoDB as your default, so it is restored across reloads, sign-ins, and devices. In local mode, the choice is saved for the local workspace. Each Pill retains its requested model for retries and grounded chat; its effective model is recorded separately when generation falls back to Ollama. New Pills created from other views use the account default.

Keys are encrypted in MongoDB and never returned in full. Configure one persistent `PROVIDER_KEYS_ENCRYPTION_KEY` on both API and workers before saving keys. Generate it once with `uv run python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'` from `apps/api`, then store it in `apps/api/.env` (or your deployment secret manager). Back up this key separately from the database. Replacing or losing it makes existing saved provider credentials unreadable; restore it or replace the affected personal keys in Settings. Missing encryption configuration disables hosted-key operations but leaves Ollama usable. Never expose the encryption key through a `NEXT_PUBLIC_*` variable.

Hosted generation credentials are managed exclusively through Settings. A missing personal key falls back to the configured Ollama generation model. Invalid keys, access restrictions, quota errors, provider outages and undecryptable credentials produce explicit errors rather than switching models. In-flight operations may finish using the credential they already resolved; replacement and deletion affect subsequent operations. `GET /api/v1/models` reports account-specific availability. Keep Ollama’s `nomic-embed-text` available for embeddings; hosted generation does not require the local generation model to be installed.

Hosted open models work through their inference APIs; Hugging Face tokens must allow Inference Providers calls. Z.ai uses a standard API key and standard endpoint, not a GLM Coding Plan subscription key. Provider availability and billing depend on the user’s account. Connection testing sends a small synthetic JSON request, never study sources, and may incur a small provider charge. Study generation and chat send selected source text to the chosen provider. See [preset comparison guidance](../apps/api/evals/README.md) for model sources and live evaluation instructions.

## Storage and generated artifacts

Compose starts SeaweedFS with persistent object storage in the `seaweedfs-data` volume. API and worker containers use `http://seaweedfs:8333`; processes on the host use `http://localhost:8333`. Credentials and bucket settings come from `apps/api/.env`. The application creates its configured bucket automatically. Port 8333 is an S3 API endpoint, not a web console.

Original files, canonical extraction JSON, and generated PNG visuals live in object storage. Notes and practice artifacts live in MongoDB. Interactive 3D JavaScript and its cited handoff live in the `pill_three_d` collection and load through an owner-scoped endpoint when the 3D tab opens. ZIP export contains Markdown and PNG visuals; it excludes original files and interactive models.

`S3_ENDPOINT_URL` is used for server-side storage operations. Set `S3_PUBLIC_ENDPOINT_URL` when browsers reach the same bucket through a different origin. Compose uses `http://seaweedfs:8333` internally and defaults signed links to `http://localhost:8333`. For remote deployments, set the public endpoint to an address reachable by users' browsers. URLs are signed directly for that endpoint; their host is never rewritten after signing. Outside Compose, leaving the public endpoint empty preserves the existing S3 endpoint and signing behavior. Use the same region, credentials, and bucket for both endpoints.

Stopping Compose with `down` retains the named storage volume. Removing that volume deletes stored objects; back up both MongoDB and object storage when keeping real study materials. Development email previews inside the API container are not in that volume and can disappear when the container is recreated; resend verification to generate a new preview if needed.

## Public deployments

The supplied Compose file is a local development/self-hosting configuration. For a public deployment:

- For an account-based public deployment set `NOTEESTA_AUTH_ENABLED=true`, `APP_ENV=production`, a stable `JWT_SECRET` of at least 32 characters, and your persistent provider-key encryption key if using BYOK.
- Configure `EMAIL_ADAPTER=resend`, `RESEND_API_KEY`, and `EMAIL_FROM` on a verified sender domain. Production startup requires Resend and an HTTPS `WEB_URL`.
- Set `WEB_URL` and `CORS_ORIGINS` to the exact frontend origin. Keep frontend and API under the same parent domain and use HTTPS. See [authentication deployment details](authentication.md#google-and-resend).
- Build a custom web image with `NEXT_PUBLIC_API_URL` set to the browser-accessible API origin plus `/api/v1`, then select that image through a Compose override. Published web images use localhost; this build-time URL cannot be changed by setting a container environment variable.
- For the separate website only, set `NOTEESTA_SITE_URL` before building to your public website origin. Its default is `https://noteesta.com`; it drives canonical metadata, robots, sitemap, and LLM guides. For the public website on Vercel, use `apps/site` as the project’s Root Directory. The product has no marketing SEO configuration.
- Replace the example storage credentials and configure persistent storage, database backups, and an API ingress appropriate to your deployment. The local Compose API port binds to loopback.

Google sign-in is optional; configure the OAuth credentials and exact callback URL in the [authentication guide](authentication.md). Local email previews are for development only.

## Diagnostics

```bash
curl http://localhost:8000/api/v1/healthz
```

Inspect the JSON `status` and individual `dependencies` for MongoDB, object storage, and Celery connectivity. A `failing` health response currently still uses HTTP 200, so an HTTP-only check is insufficient. Model availability is reported separately through authenticated `GET /api/v1/models`.

Use the API documentation at `http://localhost:8000/docs`. If a Pill stays queued, check the worker and Redis; processing can also fail on MongoDB, object storage, parsing, or model access. API and worker logs identify the failing stage.

## Development checks

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

## Live generation evaluations

The evals live under [`apps/api/evals`](../apps/api/evals) with Python providers and Python assertions. They load the same shared prompt files used by the backend and run serially because local multimodal models can consume substantial memory.

Promptfoo's runner is a Node CLI, but it is not a frontend dependency or package script. Use its one-off pnpm runner with the backend's uv interpreter:

```bash
PROMPTFOO_PYTHON="$(cd apps/api && uv run python -c 'import sys; print(sys.executable)')" \
  pnpm dlx promptfoo@0.123.1 eval -c apps/api/evals/sections.yaml --env-file apps/api/.env -j 1
```

Replace `sections.yaml` with `notes.yaml`, `materials.yaml`, `visuals.yaml`, or `chat.yaml` to run another required job. The Python provider uses the same structured adapters as production. It defaults to `OLLAMA_MODEL`; set `EVAL_PROVIDER`, `EVAL_MODEL`, and the corresponding `EVAL_*` key for a hosted preset. Qwen reasoning is disabled. The [comparison guide](../apps/api/evals/README.md) generates matrices against the local baseline without exporting account keys.

The materials suite checks the MCQ target for concise notes (two questions) and fuller notes (five distinct questions), including source evidence for each answer.

Run all suites sequentially:

```bash
for config in sections notes materials visuals chat; do
  PROMPTFOO_PYTHON="$(cd apps/api && uv run python -c 'import sys; print(sys.executable)')" \
    pnpm dlx promptfoo@0.123.1 eval -c "apps/api/evals/${config}.yaml" --env-file apps/api/.env -j 1 || exit 1
done
```
