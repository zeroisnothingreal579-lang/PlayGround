# LinkPilot AI deployment

This guide covers local production builds, Docker Compose, TLS reverse proxies, remote browser workers, and operational checks.

## Safety boundary

LinkPilot is for authorized redirect inspection, browser QA, and ad-placement observation. It does not click ads, solve or bypass CAPTCHAs, bypass rewarded-link steps, rotate identities to simulate humans, or fabricate visits, clicks, impressions, or earnings. Keep `BLOCK_PRIVATE_TARGETS=true` in production and only submit URLs you own or are authorized to test.

## Local production

```bash
cp .env.example .env
# Edit .env: at minimum AUTH_PASSWORD, AUTH_SECRET,
# CREDENTIAL_ENCRYPTION_KEY, and WORKER_TOKEN.
npm ci
npm run build
npm start
```

`npm start` reads `PORT` (or `APP_PORT`) and serves the built SPA from `dist/`. The harness `start.sh` installs dependencies when missing, builds the client, and starts the server on `${PORT:-${APP_PORT:-3000}}`.

Generate secrets:

```bash
openssl rand -base64 32   # AUTH_PASSWORD
openssl rand -hex 32      # AUTH_SECRET
openssl rand -hex 32      # CREDENTIAL_ENCRYPTION_KEY
openssl rand -hex 32      # WORKER_TOKEN
openssl rand -hex 32      # ANALYTICS_API_KEY
```

Keep `CREDENTIAL_ENCRYPTION_KEY` stable. Changing it makes previously stored AI API keys undecryptable. `AUTH_SECRET` must also remain stable so session tokens survive restarts.

## Docker Compose

1. Create `.env` from `.env.example`.
2. Set `POSTGRES_PASSWORD` to a URL-safe value, or override the app's `DATABASE_URL` explicitly if the password contains reserved URL characters.
3. Start the stack:

```bash
docker compose up -d --build
docker compose ps
curl -fsS http://127.0.0.1:3000/api/health
```

Services:

- `postgres`: PostgreSQL 16 with a persistent volume.
- `app`: LinkPilot API, SPA, WebSocket hub, local worker, and migrations/schema bootstrap.
- `worker`: Playwright browser worker that registers with `WORKER_TOKEN` and polls for jobs.

The worker image is based on `mcr.microsoft.com/playwright:v1.64.1-noble`, which includes Chromium. Keep the image tag aligned with `playwright-core` in `package-lock.json`.

Scale browser capacity independently:

```bash
docker compose up -d --scale worker=3
```

Each worker needs a unique `WORKER_ID`. For scaled workers, set IDs through a Compose override or an orchestrator template.

## Remote workers

A remote worker needs network access to the app, a matching `WORKER_TOKEN`, and Chromium.

```bash
export LINKPILOT_SERVER_URL="https://linkpilot.example.com"
export WORKER_TOKEN="<same token as the app>"
export WORKER_ID="worker-eu-1"
export WORKER_NAME="eu-west-browser"
export WORKER_REGION="eu-west"
export WORKER_MAX_SESSIONS="8"
export WORKER_CONCURRENCY="3"
export CHROMIUM_PATH="/usr/bin/chromium"
npm run worker
```

The worker registers, heartbeats every 15 seconds, claims jobs, posts session updates/events/ads/previews, and polls pause/stop controls. If its heartbeat is lost for more than 90 seconds, active remote sessions are marked failed instead of hanging indefinitely.

Workers must be able to reach target sites. Use an egress firewall, block private address ranges, and keep `BLOCK_PRIVATE_TARGETS=true`. Regional proxies are for compatibility testing only and do not make automated sessions genuine human visitors.

## Reverse proxy and TLS

Terminate TLS at a reverse proxy and forward both HTTP and WebSocket traffic.

### Caddy

```caddyfile
linkpilot.example.com {
    encode gzip
    reverse_proxy 127.0.0.1:3000
}
```

Caddy handles WebSocket upgrades automatically.

### Nginx

```nginx
server {
    listen 443 ssl http2;
    server_name linkpilot.example.com;

    ssl_certificate     /etc/letsencrypt/live/linkpilot.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/linkpilot.example.com/privkey.pem;

    client_max_body_size 4m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /ws {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 3600s;
    }
}
```

Do not expose PostgreSQL or the worker port publicly. The worker only needs outbound access to the app and target sites.

## Production checklist

- Set `AUTH_PASSWORD`, `AUTH_SECRET`, `CREDENTIAL_ENCRYPTION_KEY`, and `WORKER_TOKEN`.
- Set `DEMO_MODE=false`.
- Use PostgreSQL with `DATABASE_URL`; keep `DATABASE_FALLBACK=false` if you want startup to fail rather than silently use the JSON store.
- Keep `BLOCK_PRIVATE_TARGETS=true` and `ALLOW_LOCAL_TARGETS=false`.
- Run the app as a non-root user (the Docker image uses `pwuser`).
- Persist `/app/.data` if using the file store or generated credential key.
- Back up PostgreSQL and the encryption key together.
- Put the app behind TLS and restrict access to authorized operators.
- Configure `ANALYTICS_API_KEY` only when you have an authorized platform report feed.
- Monitor worker heartbeats, active-session quota, disk usage, and browser crashes.

## Backups and retention

PostgreSQL is the source of truth in production. Back it up with `pg_dump` and store the database dump and `CREDENTIAL_ENCRYPTION_KEY` in a secure secret manager. `EVENT_RETENTION` controls the number of retained session events in the file store; PostgreSQL schema creation and retention are handled by the server's store implementation.

## Health and troubleshooting

```bash
curl -fsS http://127.0.0.1:3000/api/health
docker compose logs -f app
docker compose logs -f worker
```

- **401 on every API call**: sign in again. If `AUTH_SECRET` changes on restart, existing tokens become invalid.
- **Browser sessions fail immediately**: confirm Chromium is installed and `CHROMIUM_PATH` is correct. In Docker, verify `PLAYWRIGHT_BROWSERS_PATH=/ms-playwright`.
- **Worker never appears**: check `LINKPILOT_SERVER_URL`, `WORKER_TOKEN`, and outbound connectivity. The worker sends `x-worker-id` and a bearer token.
- **Remote sessions stuck**: check the worker heartbeat in Infrastructure. Lost heartbeats are failed after 90 seconds.
- **Database unavailable**: with `DATABASE_FALLBACK=true` the app uses `.data/linkpilot.json`. This is convenient locally but not a production substitute for PostgreSQL.
- **Build fails on `@apply btn`**: custom utilities are declared with `@utility` for Tailwind CSS 4. Keep that declaration when editing `src/index.css`.
