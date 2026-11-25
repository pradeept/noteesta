# Deployment modes

`apps/site` is the public website and fixture-backed demo. `apps/web` is the product: `/` opens the workspace, `/workspace` redirects to `/`, and `/pills` and `/settings` remain product routes. `NOTEESTA_ENABLE_WORKSPACE` is removed.

## Local single-user workspace

Copy the API and web `.env.example` files and configure MongoDB. Choose a [Docker setup](../README.md#docker) to start Noteesta with either host Ollama (`compose.yaml`) or containerized Ollama (`compose.ollama.yaml`).

Open http://localhost:3000. Compose pulls web and API images from Docker Hub and uses the same API image for the worker. It defaults `NOTEESTA_AUTH_ENABLED=false` and binds published ports to localhost. JWT, email and OAuth settings are unnecessary. Redis still supports generation jobs. MongoDB/vector search requirements are unchanged.

All visitors to an auth-disabled instance share the same workspace. The API assigns the reserved `local-workspace` identity; browsers cannot choose it. Ownership filters, file paths, worker jobs and saved provider settings retain that identity across restarts. Provider credentials still require the persistent encryption key on API and worker. Settings remain available without an account menu.

## Account-based deployments

Set `NOTEESTA_AUTH_ENABLED=true`, restart the API and reload browsers. Configure authentication as described in [authentication.md](authentication.md). The backend defaults to enabled when this variable is absent; local templates and Compose explicitly select disabled mode. Invalid boolean settings fail startup.

`GET /api/v1/config` supplies the browser's runtime mode and local identity. Failure to fetch config never enables local access. Account endpoints return 404 when auth is disabled. Switching modes does not migrate ownership: existing local data stays under the local identity, while signed-in accounts use their own IDs. Returning to local mode exposes that local workspace again. No first-registrant claim or automatic data reassignment occurs.

## Independent builds

Run install, lint, typecheck, tests and build from each frontend directory. `Dockerfile.web` builds the product. Move the noteesta.com hosting root to `apps/site` when deploying this change. Public URLs `/` and `/app` stay unchanged there.

The published product image uses `http://localhost:8000/api/v1`. Source builds accept `NEXT_PUBLIC_API_URL` as a build argument; changing the browser API origin requires building a custom web image and selecting it with a Compose override. The default Compose file pulls images and has no build sections. Set exact CORS origins and HTTPS for account-based public deployments.

The site retains a small copied set of UI types, styling and the 3D viewer/runtime so each app builds independently. No cross-app source imports or backend dependencies are required.
