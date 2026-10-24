# LinkPilot AI

Authorized URL inspection and isolated multi-window browser automation, with a real-time operations dashboard and measured analytics.

LinkPilot inspects redirect chains, runs isolated Chromium sessions on local or remote workers, uses an optional AI agent to analyze pages and ad placements, and reports only activity it actually observed. It is built for redirect QA, publisher-approved placement auditing, and testing properties you own or are authorized to inspect.

## What it does

- **Redirect inspection**: follows redirect chains with SSRF protection, loop detection, CAPTCHA and block detection, risk scoring, and ad-network signature detection.
- **Isolated sessions**: creates fresh browser contexts per session with separate cookies, storage, cache, and service workers. Sessions run locally or on registered remote workers.
- **AI page agent**: OpenAI-compatible analysis with a deterministic DOM fallback. Every proposed action passes a strict policy allowlist before execution.
- **Ad-placement intelligence**: detects and measures visible placements without clicking them or claiming a verified impression.
- **Real-time operations**: WebSocket updates for sessions, events, previews, workers, ads, and analytics.
- **Measured analytics**: sessions, completion rate, destinations, and ad detections from LinkPilot logs, clearly separated from platform-verified metrics imported through an authorized API.
- **Production storage**: PostgreSQL with automatic schema bootstrap, plus a JSON file fallback for local development.

## Safety boundary

LinkPilot is explicitly **not** a traffic generator or ad-fraud tool. The server and browser runner enforce these rules:

- No advertisement or sponsored-link clicks.
- No CAPTCHA solving or human-verification bypass.
- No rewarded-link or offer-step bypass.
- No identity rotation to simulate human visitors.
- No fabricated visits, clicks, impressions, or revenue.
- No evasion of platform rate limits or access controls.
- Private, local, and metadata targets are blocked by default.

Verified visits, clicks, impressions, and earnings appear only when imported through `POST /api/analytics/verified` with an authorized API key. LinkPilot never estimates them. Use the tool only on properties you own or are authorized to test.

## Quick start

```bash
npm ci
cp .env.example .env
# Set AUTH_PASSWORD, AUTH_SECRET, CREDENTIAL_ENCRYPTION_KEY, and WORKER_TOKEN.

npm run dev
```

Open `http://localhost:3000`. Vite proxies `/api` and `/ws` to the API on port `3001`.

Production build:

```bash
npm run build
npm start
```

The harness `start.sh` builds the client and starts the full-stack server on `${PORT:-${APP_PORT:-3000}}`.

## Configuration

All configuration is environment-driven. See [`.env.example`](.env.example) for the complete list and [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for Docker, TLS, workers, backups, and troubleshooting.

Minimum production values:

```bash
AUTH_PASSWORD=<strong operator password>
AUTH_SECRET=<openssl rand -hex 32>
CREDENTIAL_ENCRYPTION_KEY=<openssl rand -hex 32>
WORKER_TOKEN=<openssl rand -hex 32>
DATABASE_URL=postgres://user:password@host:5432/linkpilot
BLOCK_PRIVATE_TARGETS=true
DEMO_MODE=false
```

Generate secrets with `openssl rand -hex 32` (or `-base64 32` for the password). Keep the encryption key stable; changing it makes stored AI credentials undecryptable.

## Docker

```bash
cp .env.example .env
# Set POSTGRES_PASSWORD, AUTH_PASSWORD, AUTH_SECRET,
# CREDENTIAL_ENCRYPTION_KEY, and WORKER_TOKEN.

docker compose up -d --build
curl -fsS http://127.0.0.1:3000/api/health
```

The stack includes PostgreSQL, the app, and a Playwright browser worker. Scale workers with `docker compose up -d --scale worker=3` and ensure each worker has a unique `WORKER_ID`.

## Remote workers

```bash
export LINKPILOT_SERVER_URL="https://your-linkpilot-host"
export WORKER_TOKEN="<same token as the app>"
export WORKER_ID="worker-eu-1"
export WORKER_REGION="eu-west"
export WORKER_MAX_SESSIONS="8"
export WORKER_CONCURRENCY="3"
npm run worker
```

Workers register, heartbeat, claim jobs, and report session updates, events, ad observations, and previews. A lost heartbeat fails the active remote session after 90 seconds.

## Architecture

```text
src/                     React 19 + TypeScript + Tailwind CSS 4 dashboard
  state/AppContext.tsx   Auth, data loading, WebSocket merging, actions
  components/            Layout, UI primitives, charts, session drawer
  pages/                 Overview, links, sessions, activity, ads,
                         infrastructure, analytics, settings, login
server/
  app.ts                 REST API, auth, exports, static SPA fallback
  index.ts               Bootstrap and graceful shutdown
  security.ts            Auth, rate limiting, worker/analytics tokens
  realtime.ts            WebSocket hub
  store/                 PostgreSQL and JSON file stores
  services/
    urlInspector.ts      Redirects, SSRF guard, risk, ad signatures
    browserRunner.ts     Playwright contexts, previews, safe execution
    agent.ts             DOM analysis, heuristics, LLM planning
    policy.ts            Enforced action allowlist and ad guards
    sessionManager.ts    Queues, local/remote workers, controls
    analytics.ts         Measured metrics, verified imports, CSV rows
worker/agent.ts          Remote worker registration and job polling
shared/types.ts          Shared data model
tests/                   URL inspector, policy, CSV, analytics tests
```

## API overview

Authenticated routes use `Authorization: Bearer <session token>`. Worker routes use the worker bearer token plus `x-worker-id`. The verified analytics import uses its own bearer token.

| Area | Endpoints |
| --- | --- |
| Health/auth | `GET /api/health`, `POST /api/auth/login`, `GET /api/auth/session` |
| Links | `GET/POST /api/links`, `POST /api/links/import`, `POST /api/links/:id/inspect`, `DELETE /api/links/:id` |
| Sessions | `GET /api/sessions`, `POST /api/batches`, session start/pause/resume/stop, bulk controls |
| Activity | `GET /api/sessions/:id/events`, `GET /api/activity` |
| Ads | `GET /api/ads`, `GET /api/sessions/:id/ads` |
| Workers | `GET /api/workers`, register/heartbeat, job claim and reporting |
| Analytics | `GET /api/analytics`, `GET /api/analytics/export`, `POST /api/analytics/verified` |
| Settings | `GET /api/settings`, `PUT /api/settings/ai`, `GET /api/policy` |

## Scripts

```bash
npm run dev        # API on 3001 + Vite on 3000
npm run build      # production client build
npm start          # start the API and serve dist/
npm run worker     # start a remote browser worker
npm run typecheck  # tsc --noEmit
npm run test       # node:test suites
npm run verify     # typecheck + tests + build
```

## Testing

```bash
npm run verify
```

The test suite covers CSV parsing/escaping, policy enforcement, URL normalization, private-address blocking, redirect chains, CAPTCHA/ad detection, loops, blocked responses, and analytics aggregation. It uses mocked network responses and does not contact real targets.

## Deployment

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for Docker Compose, Caddy/Nginx TLS with WebSocket forwarding, worker scaling, PostgreSQL backups, and production checks.

## License and responsible use

Use LinkPilot only for authorized testing. You are responsible for complying with the terms of any site, shortener, publisher, or advertising platform you inspect. LinkPilot does not provide traffic, revenue, or engagement.

---

# PlayGround

<!-- omgithub:readme:start -->
## 🚀 Build, play, and remix with OMGithub

**Created using [OMGithub.com](https://omgithub.com).**

[![OMGithub](https://img.shields.io/badge/OMGithub-Open%20project-orange?style=for-the-badge)](https://omgithub.com/zeroisnothingreal579-lang/PlayGround)
[![GitHub](https://img.shields.io/badge/GitHub-Source-181717?logo=github&style=for-the-badge)](https://github.com/zeroisnothingreal579-lang/PlayGround)

- 🎮 [Open the project](https://omgithub.com/zeroisnothingreal579-lang/PlayGround).
- ✨ [Remix this project](https://omgithub.com/?remix=zeroisnothingreal579-lang%2FPlayGround).
- 💻 [Explore the source](https://github.com/zeroisnothingreal579-lang/PlayGround).
- 🛠️ [Check build runs](https://github.com/zeroisnothingreal579-lang/PlayGround/actions).
- 🐛 [Report an issue](https://github.com/zeroisnothingreal579-lang/PlayGround/issues).
- 👤 [Explore the creator's projects](https://omgithub.com/zeroisnothingreal579-lang).
- 🌍 [Create with OMGithub](https://omgithub.com).
<!-- omgithub:readme:end -->
