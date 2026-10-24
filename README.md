# LinkPilot AI

LinkPilot AI is a policy-safe link inspection and browser-session dashboard. It resolves redirect chains, detects advertising and challenge surfaces, runs isolated browser sessions, records evidence, and exposes real analytics only when an authorized integration supplies them.

The application is intentionally **analysis-only**. It does not click ads, activate rewarded controls, bypass countdowns, rotate IPs to simulate people, or fabricate visitors, clicks, impressions, or earnings.

## Features

- **URL inspector** with redirect chains, SSRF protection, risk scoring, tracking-parameter detection, shortener detection, and ad/control signals.
- **Multi-session automation** with independent Playwright contexts, concurrency limits, pause/resume/stop controls, live logs, and JPEG previews.
- **AI page analysis** through any OpenAI-compatible chat-completions endpoint, with deterministic heuristic fallback.
- **Advertising reporting** for networks, formats, element counts, and visibility duration. Detections are explicitly not verified impressions.
- **Operational dashboard** with worker CPU, memory, bandwidth, uptime, active sessions, and limits.
- **Verified analytics** through a signed webhook or an authorized analytics API. No sample metrics are seeded.
- **CSV exports** for sessions and inspections with spreadsheet-formula neutralization.
- **Optional bearer-token auth**, rate limiting, HMAC webhooks, CSP, and safe browser defaults.
- **PostgreSQL or file persistence**, responsive UI, dark visual system, and Docker deployment.

## Stack

- React 18, TypeScript, Vite 6, Tailwind CSS, Recharts, Lucide
- Node.js 20+, Express, `ws`, Playwright Chromium
- PostgreSQL 16 (optional) or JSON file storage
- Docker and Docker Compose for production packaging

## Quick start

```bash
cp .env.example .env
npm ci
npx playwright install chromium
npm run dev
```

Open `http://localhost:5173`. The API runs on `http://localhost:3000` and Vite proxies `/api` and `/ws`.

For a production-style local run:

```bash
npm run build
npm start
```

Open `http://localhost:3000`. The Node server serves `dist/` and the API from one port.

### OMGithub/runtime start

`start.sh` installs dependencies when missing, builds the frontend, and starts the Node server on `APP_PORT` (default `3000`). Long-lived servers should run in tmux or another persistent supervisor.

## Policy boundary

The following are disabled in the API, automation engine, and UI:

- Automated ad clicks or engagement
- Rewarded-link manipulation, payout farming, or offer completion
- Bypassing required advertising steps or countdowns
- Artificial visitors, clicks, impressions, or revenue
- IP rotation intended to simulate distinct people

Allowed behavior is limited to authorized redirect inspection, reading page content, scrolling, detecting ad/challenge surfaces, and testing owned or explicitly authorized placements. Browser sessions are labeled automation runs, not human visitors.

## Configuration

Copy `.env.example` to `.env` and adjust as needed.

| Variable | Default | Purpose |
| --- | --- | --- |
| `APP_PORT` | `3000` | HTTP port |
| `HOST` | `0.0.0.0` | Bind address |
| `LINKPILOT_AUTH_TOKEN` | empty | Enables bearer-token auth when set |
| `DATABASE_URL` | empty | PostgreSQL connection string; empty uses the file store |
| `POSTGRES_PASSWORD` | `linkpilot` | Compose-only PostgreSQL password |
| `DATA_DIR` | `.data` | File-store directory |
| `MAX_SESSIONS` | `100` | Maximum sessions per job |
| `MAX_CONCURRENT_BROWSERS` | `6` | Browser-context concurrency cap |
| `SESSION_TIMEOUT_MS` | `45000` | Maximum session duration |
| `MAX_REDIRECTS` | `10` | Redirect-hop limit |
| `FETCH_TIMEOUT_MS` | `9000` | Per-request timeout |
| `PREVIEW_INTERVAL_MS` | `6000` | Preview capture interval |
| `ALLOW_PRIVATE_TARGETS` | `false` | Allow private destinations; keep false in production |
| `WORKER_ID`, `WORKER_REGION` | `worker-primary`, `local-dev` | Worker identity shown in telemetry |
| `WORKER_MAX_SESSIONS` | `12` | Advertised worker capacity |
| `WORKER_PROXY_*` | empty | Optional authorized egress proxy, not traffic rotation |
| `AI_BASE_URL` | empty | OpenAI-compatible base URL |
| `AI_API_KEY` | empty | Model API key |
| `AI_MODEL` | `gpt-4o-mini` | Model name |
| `ANALYTICS_PROVIDER` | empty | Analytics provider label |
| `ANALYTICS_API_URL` | empty | Authorized analytics endpoint |
| `ANALYTICS_API_KEY` | empty | Analytics API key |
| `ANALYTICS_WEBHOOK_SECRET` | empty | HMAC secret for verified events |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE` | empty | Optional custom Chromium path |

When `LINKPILOT_AUTH_TOKEN` is set, send `Authorization: Bearer <token>` to API routes and pass `?token=<token>` on the WebSocket URL. The browser client stores the token in local storage and attaches it automatically. `/api/health` and `/api/auth/status` remain public for probes; the signed webhook remains public but requires a valid HMAC signature.

### AI analysis

Set `AI_BASE_URL` to a base such as `https://api.openai.com/v1`, or directly to a `/chat/completions` endpoint. If `AI_BASE_URL` or `AI_API_KEY` is unset, LinkPilot uses local heuristics and reports `source: "heuristic"`. Page content is treated as untrusted evidence and is never treated as instructions.

### Verified analytics

Authorized providers can be pulled with `POST /api/settings/test-analytics` after configuring `ANALYTICS_API_URL` and `ANALYTICS_API_KEY`.

Providers can also push verified events:

```bash
BODY='{"events":[{"id":"click-2026-001","type":"click","value":1,"at":"2026-10-24T12:00:00Z","source":"publisher"}]}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$ANALYTICS_WEBHOOK_SECRET" -hex | sed 's/^.* //')
curl -X POST http://localhost:3000/api/webhooks/verified \
  -H "Content-Type: application/json" \
  -H "X-LinkPilot-Signature: sha256=$SIG" \
  --data "$BODY"
```

Supported event types are `click`, `impression`, `earning`, and `visit`. Duplicate events are deduplicated by source, external ID, and type. Verified values are kept separate from DOM ad detections.

## API overview

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Runtime capabilities and policy state |
| `GET` | `/api/auth/status` | Public auth status |
| `POST` | `/api/auth/verify` | Validate an access token |
| `POST` | `/api/inspect` | Inspect one or more URLs |
| `GET` | `/api/inspections` | Inspection history |
| `POST` | `/api/inspections/:id/ai` | Re-run AI analysis |
| `POST` | `/api/jobs` | Create an isolated session job |
| `GET` | `/api/jobs/:id` | Job and session detail |
| `POST` | `/api/jobs/:id/action` | Start, pause, resume, or stop a job |
| `GET` | `/api/sessions` | Session list |
| `GET` | `/api/sessions/:id` | Session detail and logs |
| `GET` | `/api/sessions/:id/preview` | Latest JPEG preview |
| `POST` | `/api/sessions/:id/action` | Pause, resume, or stop one session |
| `GET` | `/api/analytics` | Aggregated analytics for a range |
| `GET` | `/api/analytics/export.csv` | Sessions or inspections CSV |
| `GET` | `/api/ads` | Ad detections and policy |
| `GET` | `/api/servers` | Worker telemetry |
| `GET` | `/api/activity` | Audit/activity feed |
| `GET/PATCH` | `/api/settings` | Runtime settings; safety policy is immutable |
| `GET` | `/api/integrations` | Integration status |
| `POST` | `/api/webhooks/verified` | Signed verified-event ingestion |
| `WS` | `/ws` | Live job, session, activity, and preview events |

## Persistence

With `DATABASE_URL`, state is stored in the `linkpilot_state` JSONB table under the `workspace-main` key. Without it, state is written atomically to `DATA_DIR/linkpilot-state.json`. Preview images are held in memory and are not persisted.

Retention defaults to 30 days. Old inspections, jobs, sessions, ad detections, and events are pruned on startup. Runtime settings can adjust `sessionDurationMs`, `maxConcurrentBrowsers`, and `retentionDays`; the analysis-only policy cannot be disabled.

## Docker deployment

```bash
cp .env.example .env
# Set LINKPILOT_AUTH_TOKEN, POSTGRES_PASSWORD, and any integrations.
docker compose up --build -d
```

Open `http://localhost:3000`. Compose runs the Playwright image with Chromium preinstalled, PostgreSQL 16, a persistent database volume, and a health check. The app container runs as the non-root `pwuser`.

For a public deployment, terminate TLS at a reverse proxy, set a strong `LINKPILOT_AUTH_TOKEN`, restrict egress if needed, and keep `ALLOW_PRIVATE_TARGETS=false`.

### Local production without Docker

```bash
npm ci --include=dev
npm run build
node server/index.mjs
```

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Vite + API with file watching |
| `npm run build` | Type-check and build `dist/` |
| `npm start` | Start the production Node server |
| `npm test` | Node test suite for security, analytics, webhooks, and telemetry |
| `npm run check` | TypeScript build check plus server syntax check |

## Security notes

- Destinations are resolved and rejected when they map to loopback, private, link-local, CGNAT, multicast, or metadata addresses. Redirects are followed manually, with hop and port limits.
- DNS rebinding remains a residual risk for any URL-fetching service; run untrusted workloads with network egress controls.
- Browser contexts use isolated storage, blocked service workers, disabled downloads, dismissed dialogs, and blocked popups.
- The API applies rate limits, body-size limits, CSP, `nosniff`, frame restrictions, and optional constant-time token checks.
- Webhook payloads require a valid HMAC-SHA256 signature. CSV cells beginning with formula characters are prefixed to prevent spreadsheet injection.
- Secrets are environment-only. The settings API never returns secret values.

## Known limitations

- DOM ad detection is not a verified impression and cannot establish publisher revenue.
- Playwright sessions consume substantial memory; tune `MAX_CONCURRENT_BROWSERS` for the host.
- Previews are in-memory and disappear on restart.
- Worker dispatch is single-node. The worker identity and telemetry fields are ready for external orchestration, but no distributed scheduler is included.
- The AI fallback is intentionally conservative and reports lower confidence than a configured model.

## Verification

The workspace verification includes:

- `npm run build` and TypeScript checks passing.
- `npm test` with 9 passing tests covering SSRF/private-address blocking, invalid URL handling, policy invariants, analytics integrity, CSV safety, webhook signatures/deduplication, and worker telemetry.
- Live API checks for health, redirect inspection, job execution, Playwright preview capture, and WebSocket updates.
- Playwright screenshots of every dashboard page at desktop and mobile widths with no browser console errors.
- Docker image and Compose stack checks, including PostgreSQL persistence across an app restart and a Playwright session with a 1280x800 JPEG preview.
