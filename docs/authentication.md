# Authentication and frontend data

Noteesta owns its accounts in FastAPI and MongoDB. Email/password and Google sign-in produce the same application session. Signup is open; workspace access requires a verified email. Existing development records are not automatically assigned to new accounts. The public homepage and `/app` example remain accessible without authentication or API calls.

## Local setup

1. Install dependencies with `pnpm install` and, from `apps/api`, `uv sync --extra dev`.
2. Start MongoDB, Redis, and object storage as described in the root README. Auth rate limiting needs Redis even when generation is not running.
3. In `apps/api/.env`, set a stable `JWT_SECRET` (generate with `openssl rand -hex 32`), `WEB_URL=http://localhost:3000`, and `CORS_ORIGINS=http://localhost:3000`. An empty secret is supported only in development and invalidates sessions on process restart; use a stable secret for multiple API processes.
4. Set `NOTEESTA_ENABLE_WORKSPACE=true` in `apps/web/.env`, start both applications, and open `/register`.
5. With `EMAIL_ADAPTER=local`, find email previews in `.local/emails/` relative to the API working directory, normally `apps/api/.local/emails/`. Open the verification URL from the JSON message, confirm verification, and sign in. These files contain single-use secrets, are excluded from git, and use private filesystem permissions.

The browser must support Web Locks and run on HTTPS or localhost. Keep frontend and API under the same parent domain in production; cookies are host-only on the API. Frontend origins must exactly match CORS configuration. Browser auth POSTs require an allowed `Origin` and `X-Noteesta-Client: web`; private resource requests require `Authorization: Bearer <accessToken>`. The former `X-User-Id` header and demo identity bypass are removed.

## Google and Resend

Create a Google OAuth web client and configure its consent screen. Register this exact development callback:

```text
http://localhost:8000/api/v1/auth/google/callback
```

Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI` in the backend environment. Register the corresponding HTTPS API callback for production. Google uses authorization code with PKCE, nonce, state, and a browser-bound transaction. Request scopes are `openid email profile`; provider tokens are not stored as application sessions.

Returning Google users match by provider subject. Verified matching emails link automatically to an existing account. If that account was unverified, its previous password and email tokens are invalidated; the owner can establish a password with the recovery flow. Verified password accounts retain their password when linked. A conflicting existing Google subject is rejected.

For real email, set `EMAIL_ADAPTER=resend`, `RESEND_API_KEY`, and `EMAIL_FROM` to a sender on a Resend-verified domain. Both HTML and plain-text messages are sent using an idempotency key. Delivery failures return a recoverable error; use resend verification or password recovery to request another link.

Retrying signup for an existing unverified account sends another verification email without changing its password or profile. Verified accounts keep the generic signup response without another email. If delivery fails, the API logs the Resend HTTP status and error code without recipients, credentials, message bodies, or verification links. Check Resend's email logs for accepted messages and delivery events; a sending-only API key cannot read those logs through the API.

Production startup requires `APP_ENV=production`, a `JWT_SECRET` of at least 32 characters, `EMAIL_ADAPTER=resend`, `RESEND_API_KEY`, and HTTPS `WEB_URL`. Configure exact HTTPS CORS origins and TLS at the API ingress. Configure trusted proxy handling at deployment so rate limiting sees the real client address; the application does not trust arbitrary `X-Forwarded-For` headers. Do not log auth bodies, cookies, authorization headers, or provider responses at the proxy.

## Auth API and session behavior

All routes are relative to `/api/v1/auth`. JSON field names use camelCase.

| Method | Path | Input / result |
| --- | --- | --- |
| POST | `/register` | `email`, `password`, `displayName`; generic 202 response |
| POST | `/login` | `email`, `password`; access token and user |
| POST | `/verify-email` | `token`; verify ownership |
| POST | `/resend-verification` | `email`; generic 202 response |
| POST | `/forgot-password` | `email`; generic 202 response |
| POST | `/reset-password` | `token`, `password`; revoke previous sessions |
| POST | `/refresh` | Refresh cookie; rotate and issue access token |
| POST | `/logout` | Refresh cookie; revoke current session, clear cookie |
| POST | `/logout-all` | Access bearer plus browser origin checks; revoke all sessions |
| GET | `/me` | Access bearer; return public user fields |
| GET | `/google/start` | Optional `return_to` local path; redirect to Google |
| GET | `/google/callback` | Browser-bound provider callback |

Login and refresh return `{ accessToken, expiresIn, user }`. User fields are `id`, `email`, `displayName`, `emailVerified`, and `loginMethods`. Passwords accept 12–128 characters and use Argon2 hashes. Verification tokens expire after 24 hours; reset tokens after 30 minutes. Both are stored as hashes, consumed atomically, and require POST confirmation, so link scanners cannot consume them with GET.

Access JWTs last 15 minutes and stay in browser memory. Refresh JWTs use an HttpOnly, SameSite=Lax cookie scoped to `/api/v1/auth`, Secure outside development, without a Domain attribute. Each login creates a separate session with an absolute 30-day expiry. Refresh atomically replaces the stored token hash; replay revokes the session. MongoDB checks make logout and password-reset revocation immediate for access tokens too. TTL indexes clean expired records; authorization explicitly checks expiration without waiting for TTL cleanup.

The frontend deduplicates refreshes and serializes refresh/login/logout across tabs using Web Locks. It retries a resource request once after a 401; it does not retry writes after network failures. Logout broadcasts to other tabs and aborts old requests. Temporary connection failures preserve existing session state and allow retry. API responses use `Cache-Control: no-store`.

Errors use `detail: { code, message }`; standard FastAPI validation responses retain their validation array. Auth attempts are limited to 30 per action/IP per 15 minutes; login additionally allows five per email, and registration/recovery/resend allow three per email in that interval. Redis failures fail closed with 503. Rate-limit responses use 429 with `Retry-After`.

## Query cache and notifications

TanStack Query owns server data. Private keys begin with `['user', userId]`; no private query cache is persisted. Defaults are 30 seconds of freshness, five minutes of inactive retention, and two retries for transient read failures. Model choices stay fresh for five minutes. Stale queries refetch on focus/reconnection.

Active pill details poll every two seconds; lists containing queued/processing work poll every five seconds. Polling pauses in hidden tabs and stops at terminal states. Mutations update returned data and invalidate dependent domain queries without refetching unrelated model availability. Downloads first request an authenticated five-minute signed URL; exports use the authenticated client.

Logout/account changes cancel requests, clear private query caches, and clear saved chat history. Generation preferences and chat storage use versioned user-specific keys. Browser-wide appearance preferences remain available. React owns local UI state; no Zustand store duplicates server/session data. Sonner handles success/error/warning notifications with deduplicated background failures and processing completion events; form validation stays inline.

## Local data reset

Reset is a separate command; application startup never deletes development data. It refuses non-development mode and non-local MongoDB, Redis, or object storage targets. Run it from `apps/api`, with the exact configured database name:

```bash
uv run python -m src.auth.reset_local --database noteesta
```

This is a read-only dry-run reporting record, file, and email-preview counts. Before deletion, stop the API and workers and drain pending generation tasks. Execution also refuses live workers or queued/unacknowledged jobs:

```bash
uv run python -m src.auth.reset_local --database noteesta --execute
```

Execution removes account/session/OAuth/email records, pills/collections/chunks/3D records, storage objects under `users/`, and local email JSON previews. It preserves database indexes, the storage bucket, and bundled public demo fixtures. Do not use this command for Atlas or shared/deployed environments.

## Verification

Run backend checks from `apps/api`: `uv run pytest`, `uv run ruff check .`, and `uv run black --check .`. If the tools are missing, install with `uv sync --extra dev`. Run frontend unit checks with `pnpm test`, `pnpm lint:web`, and `pnpm typecheck`; build with `pnpm build:web`.

Unit/HTTP tests mock external integrations. Browser tests use mocked Google/Resend/API responses and run with `pnpm --filter web test:e2e` after installing a Playwright Chromium browser. For a live smoke check, register and verify through your configured email provider, sign in, reload, sign out on one/all devices, complete Google sign-in with a fresh account and a matching verified email, and exercise an owned upload/download/export. Live Google/Resend verification requires configured credentials and domains.
