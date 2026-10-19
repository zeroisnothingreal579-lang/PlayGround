# Deployment

CloudDroid has two separable concerns: the **web application** (stateless, easy
to scale) and the **Android runtime** (stateful, needs KVM). Deploy them
together on a single node, or keep the app in a data centre and run the runtime
on a dedicated host.

## 1. Production configuration

```dotenv
NODE_ENV=production
PORT=3000
PUBLIC_URL=https://clouddroid.example.com

# 64-char random secret; keep it stable across restarts
JWT_SECRET=<openssl rand -hex 32>
COOKIE_SECURE=true

# PostgreSQL is strongly recommended in production
DATABASE_URL=postgres://clouddroid:password@db:5432/clouddroid
# Optional: shared stream tickets and rate limits across nodes
REDIS_URL=redis://redis:6379

# Runtime
CLOUDDROID_PROVIDER=emulator
ANDROID_HOME=/opt/android-sdk
ANDROID_MAX_RUNNING=4
GMS_AVAILABLE=0
SEED_DEMO=false
```

> **Always** set a real `JWT_SECRET`, enable `COOKIE_SECURE`, disable `SEED_DEMO`
> and change the seeded passwords (or avoid seeding) before exposing the app.

## 2. Docker Compose

```bash
JWT_SECRET=$(openssl rand -hex 32) docker compose up -d --build
```

The bundled `docker-compose.yml` starts the app with PostgreSQL and Redis. It is
configured for **demo** devices by default. For live Android:

- Set `CLOUDDROID_PROVIDER=emulator` and mount an Android SDK, or
- Set `CLOUDDROID_PROVIDER=external` and point `ANDROID_SERIAL` at a device
  reachable from the container, or
- Run the Android runtime on the host and run the app natively.

The Android emulator needs `/dev/kvm`. Containerised emulators are possible but
require device passthrough:

```yaml
    devices:
      - /dev/kvm:/dev/kvm
```

## 3. Runtime host

```bash
export ANDROID_HOME=/opt/android-sdk
scripts/create-avd.sh clouddroid_demo 35
adb devices
```

- Give the host enough RAM: budget ~4 GB per concurrent emulator plus the app.
- Prefer `-gpu swiftshader_indirect` on headless servers.
- Keep `ANDROID_MAX_RUNNING` at or below what the host can sustain.
- Persist `STORAGE_DIR` and the database; AVDs live under `$ANDROID_HOME`.

## 4. Reverse proxy

Terminate TLS and forward WebSocket upgrades for streaming:

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_read_timeout 3600s;
}
```

`COOKIE_SECURE=auto` marks cookies secure when `x-forwarded-proto: https` or the
connection is already TLS.

## 5. Scaling

- The web/API tier is stateless: run several replicas behind a load balancer.
- Set `REDIS_URL` so one-time stream tickets and rate limits are shared.
- The streaming gateway is sticky per connection; long-lived WebSockets are
  fine behind an L7 proxy that supports upgrades.
- Android runtime nodes are stateful: pin a device to a node. A future
  scheduler can route `POST /devices/:id/stream-ticket` to the owning node.

## 6. Backups & upgrades

- Back up PostgreSQL (`pg_dump`) or `var/clouddroid.db` and `STORAGE_DIR`.
- Migrations run automatically on boot and are idempotent.
- Rolling restart is safe for the web tier; running emulators are reconciled on
  the next device list.

## 7. Health checks

- `GET /api/v1/healthz` — process, database and time.
- `GET /api/v1/public/status` — runtime mode, transport and booted devices.
- `GET /api/v1/system/runtime` — full runtime diagnostics.

Use `/healthz` for liveness/readiness probes.
