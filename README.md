# LinkPilot AI

**URL inspection and multi-window browser evidence for operators.**

LinkPilot AI follows redirect chains, opens destinations in isolated Chromium contexts, captures page evidence, observes probable advertising containers, and reports worker telemetry from one dark control center. It is built for passive URL diagnostics and affiliate/redirect auditing — not traffic generation or ad automation.

> **Safety boundary:** LinkPilot never clicks ads, solves CAPTCHAs, bypasses rewarded-link steps, manipulates rewards, rotates proxies, spoofs visitors, or generates artificial traffic. Probe observations are never counted as human clicks, impressions, or earnings. Revenue appears only when an authorized analytics source supplies verified metrics.

## Features

- **Redirect intelligence** — manual HTTP trace (up to 12 hops), loops, plain-HTTP hops, shorteners, tracking parameters, SSRF checks, and destination risk flags.
- **Isolated browser probes** — one clean Playwright context per session, configurable concurrency, passive scroll, screenshots, page signals, CAPTCHA/block detection, and control discovery.
- **AI page summaries** — optional OpenAI-compatible model endpoint with deterministic heuristic fallback. Page content is delimited as untrusted evidence; the model has no navigation or click tools.
- **Multi-window sessions** — launch 1–100 probes, start/pause/resume/stop runs and individual sessions, inspect live progress, logs, screenshots, ad evidence, and redirect chains.
- **Advertising evidence** — probable containers and network hints are explicitly marked unverified. There is no ad-click endpoint.
- **Verified analytics** — manually record, or POST from an authorized platform, clicks/impressions/earnings by source and period. Mixed currencies are not combined.
- **Operational telemetry** — real CPU, memory, bandwidth, event-loop latency, uptime, worker health, and queue capacity.
- **Exports and auth** — CSV exports for sessions, analyses, and verified metrics; signed 12-hour cookies, rate limits, CSP, and server-side secrets.
- **Responsive UI** — desktop sidebar, mobile bottom navigation, session evidence drawer, and accessible dark interface.

## Architecture

```
Browser (React 18 + Vite + Tailwind + Recharts)
          │  HTTPS / WebSocket
Express API + WebSocket server (Node 22)
          ├── Orchestrator queue ── Playwright Chromium contexts
          ├── Redirect / SSRF analyzer
          ├── AI summary adapter (OpenAI-compatible, optional)
          ├── Metrics collector
          └── Store: PostgreSQL or durable local JSON
```

The production server serves the built frontend from `dist/`, the API, `/screenshots`, and the WebSocket at `/ws` on one port (`3000` by default). `start.sh` builds and starts the server.

## Quick start

Requirements: Node.js 20+ (22 recommended), npm, and Chromium for browser probes.

```bash
npm ci
cp .env.example .env
# Edit .env: set DASHBOARD_PASSWORD, AUTH_SECRET, APP_ENCRYPTION_KEY
bash start.sh
```

Open <http://localhost:3000>.

For local development with hot reload:

```bash
# Terminal 1 — API/WebSocket on :3000
npm run dev

# Terminal 2 — Vite on :3002 with proxy
npm run dev:web
```

### Browser executable

Set `BROWSER_EXECUTABLE_PATH` to an installed Chromium/Chrome binary. Common Linux paths are auto-detected (`/usr/bin/chromium`, `/usr/bin/google-chrome`). If no browser is available, deep inspection falls back to static HTTP/fetch analysis and the UI reports that automation is unavailable.

## Docker Compose (app + PostgreSQL)

```bash
cp .env.example .env
# Set POSTGRES_PASSWORD plus the secrets in .env
docker compose up --build -d
docker compose logs -f app
```

The app is exposed on `http://localhost:3000`. Compose provisions PostgreSQL 16, a persistent app data volume, a Chromium runtime, and a container health check. For any public deployment, terminate TLS at a reverse proxy and set `SECURE_COOKIES=true` and `PUBLIC_BASE_URL=https://your-host`.

## Configuration

All configuration is server-side environment variables. See `.env.example` for the complete list.

| Variable | Purpose | Default |
| --- | --- | --- |
| `PORT` / `APP_PORT` | HTTP port | `3000` |
| `DASHBOARD_PASSWORD` | Enables dashboard/WebSocket authentication | open access |
| `AUTH_SECRET` | HMAC key for session cookies | `DASHBOARD_PASSWORD` |
| `APP_ENCRYPTION_KEY` | AES-256-GCM key material for connector secrets | unset |
| `SECURE_COOKIES` | Set `Secure` on session cookies | inferred from `PUBLIC_BASE_URL` |
| `DATABASE_URL` | PostgreSQL connection string | local JSON store |
| `DATA_DIR` | JSON store and screenshot directory | `./data` |
| `BROWSER_EXECUTABLE_PATH` | Chromium/Chrome executable | auto-detect |
| `AUTOMATION_ENABLED` | Enables browser probing | `true` |
| `MAX_SESSIONS_PER_RUN` | Session cap (1–100) | `100` |
| `MAX_CONCURRENT_SESSIONS` | Global browser context concurrency | `3` |
| `RATE_LIMIT_PER_MINUTE` | Per-IP API limit | `90` |
| `AI_API_URL` / `AI_API_KEY` / `AI_MODEL` | OpenAI-compatible summaries | heuristic fallback |
| `ANALYTICS_INGEST_TOKEN` | Bearer token for verified-metric ingestion | unset |
| `WORKER_HEALTH_TOKEN` | Bearer token for worker health | falls back to ingest token |
| `WORKERS_JSON` | Remote worker health definitions | none |
| `ALLOW_PRIVATE_URLS` | Disables SSRF private-address blocking (not for untrusted use) | `false` |
| `ALLOWED_PORTS` | Allowed destination ports | `80,443` |
| `MAX_REDIRECTS` | Redirect hop limit | `12` |
| `NAVIGATION_TIMEOUT_MS` | Browser navigation timeout | `30000` |
| `REQUEST_TIMEOUT_MS` | HTTP redirect request timeout | `15000` |

### AI summaries

Configure any OpenAI-compatible chat completions endpoint:

```env
AI_API_URL=https://your-provider.example/v1/chat/completions
AI_API_KEY=...
AI_MODEL=your-model
```

Without all three, LinkPilot uses deterministic heuristics. The API key never reaches the browser.

### Authorized analytics ingestion

Send externally verified figures only:

```bash
curl -X POST https://your-host/api/integrations/verified-metrics \
  -H "Authorization: Bearer $ANALYTICS_INGEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "Authorized ad-network API",
    "clicks": 42,
    "impressions": 900,
    "earnings": 12.50,
    "currency": "USD",
    "periodStart": "2026-10-01",
    "periodEnd": "2026-10-07",
    "note": "Reconciled publisher account"
  }'
```

Metrics are also editable in **Analytics → Add verified metric**. LinkPilot does not infer these values from probes.

## API

Authenticated routes require the dashboard session cookie when `DASHBOARD_PASSWORD` is set.

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Public health and capability summary |
| `GET` | `/api/auth/status` | Session/auth status |
| `POST` | `/api/auth/login` | Password login (rate-limited) |
| `POST` | `/api/auth/logout` | Clear session |
| `GET` | `/api/snapshot` | Runs, servers, analytics, config, metrics, activity |
| `GET` | `/api/config` | Public capability/config status |
| `POST` | `/api/analyze` | Inspect one URL (`url`, `deep`, `aiSummary`, `passiveScroll`) |
| `POST` | `/api/analyze/bulk` | Inspect up to 25 URLs |
| `GET` | `/api/analyses` | Stored analyses (`limit`) |
| `GET` | `/api/analyses/:id` | One analysis |
| `GET` | `/api/runs` | Stored runs |
| `POST` | `/api/runs` | Create and start a probe run (`url`, `sessionCount`, `options`) |
| `POST` | `/api/runs/:id/{start,pause,resume,stop}` | Run controls |
| `POST` | `/api/runs/:id/sessions/:sessionId/{start,pause,resume,stop}` | Session controls |
| `GET` | `/api/servers` | Worker metrics |
| `GET` | `/api/analytics` | Aggregated probe + verified analytics |
| `GET`/`POST` | `/api/verified-metrics` | List / add verified metrics |
| `DELETE` | `/api/verified-metrics/:id` | Remove a verified metric |
| `GET` | `/api/export/{runs,analyses,verified-metrics}` | CSV export |
| `GET` | `/api/worker-health` | Worker health (bearer token or dashboard session) |
| `POST` | `/api/integrations/verified-metrics` | Verified metric ingestion (bearer token) |

WebSocket: `/ws` (dashboard session required when auth is enabled). Events include `run.created`, `run.updated`, `run.tick`, `session.updated`, `server.metrics`, and `integration.metrics`.

## Security

- **SSRF guard** blocks loopback, private, link-local, multicast/reserved addresses, DNS names resolving to those ranges, embedded credentials, non-HTTP(S) protocols, and destination ports outside `ALLOWED_PORTS`.
- **No stealth/evasion**: the browser user agent includes `LinkPilotProbe/1.0`; no anti-detection patches, proxy rotation, or spoofing.
- **Authentication**: HMAC-signed, `HttpOnly`, `SameSite=Strict` session cookie with 12-hour expiry; WebSocket upgrade is authenticated; login and sensitive routes are rate-limited.
- **Secrets stay server-side**: AI keys, database URLs, and ingest tokens are never included in `publicConfig()`.
- **CSP/XFO/nosniff/referrer policy** headers are set by the app; screenshots require authentication.
- **CSV injection protection** prefixes formula-leading cells.
- **Prompt-injection boundary**: page text is treated as untrusted evidence, not agent instructions.

Rotate all example secrets. Use a trusted reverse proxy with TLS and network egress controls in production.

## Data and retention

- With `DATABASE_URL`, tables are created automatically (`linkpilot_analyses`, `linkpilot_runs`, `linkpilot_verified_metrics`).
- Without PostgreSQL, data is persisted atomically to `DATA_DIR/store.json`; screenshots are stored under `DATA_DIR/screenshots/`.
- The JSON store keeps the newest 150 analyses; run and verified-metric lists are capped by the API queries.
- Back up the database or `DATA_DIR` according to your retention policy. Screenshots may contain page content and should be handled as sensitive evidence.

## Remote workers

`WORKERS_JSON` registers remote **health** endpoints for visibility, for example:

```env
WORKERS_JSON=[{"id":"worker-1","name":"Browser 1","region":"us-east","url":"https://worker.example/api/worker-health","maxSessions":10}]
```

Workers are health-checked; **job dispatch is local to the app instance today**. Horizontal browser execution requires a separate worker service and queue integration. The UI labels this limitation rather than implying distributed execution exists.

## Testing and verification

```bash
npm run typecheck
npm test
npm run build
```

Tests cover SSRF/private-range detection, URL normalization, credential/port/protocol rejection, session-token signing, cookie parsing, AES-GCM round trips, shortener/tracker flags, analytics aggregation, and mixed-currency safety.

Runtime smoke test used during development:

```bash
curl -s http://localhost:3000/api/health
```

Browser verification was performed with Playwright at desktop and mobile widths against the production build, including login, overview, inspector detail, probe launch/navigation, sessions, advertising, analytics, workers, and settings.

## Known limitations

- Job execution is single-instance; remote workers only provide health telemetry.
- CAPTCHA/block detection is heuristic. A CAPTCHA is reported and the session stops there — it is never solved.
- Ad observations are unverified hints, never impressions or revenue.
- AI summaries require an external OpenAI-compatible provider; otherwise heuristics are used.
- Local JSON storage is durable but intended for single-instance/small deployments. Use PostgreSQL for production.
- Redirect inspection accepts only ports 80/443 by default, so internal or non-standard test endpoints must be explicitly allowed in a trusted environment.

## License

No license has been declared for this repository. Add one before distributing.
