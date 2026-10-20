# Architecture

CloudDroid separates the browser experience from the Android runtime. The
browser talks to a stateless HTTP/WebSocket API; the API talks to a runtime node
that owns the Android instances. The browser never receives hypervisor paths,
runtime credentials or another user's data.

```
┌────────────┐   HTTPS + WSS      ┌──────────────┐   adb    ┌──────────────────┐
│  Browser   │ ─────────────────► │ CloudDroid   │ ───────► │ Android runtime  │
│  (React)   │ ◄───────────────── │ API + gateway│ ◄─────── │ AVD on KVM       │
└────────────┘   PNG frames       └──────┬───────┘  frames  └──────────────────┘
                                         │
                                 ┌───────┴────────┐
                                 │ Postgres/SQLite │
                                 │ Redis (optional)│
                                 └────────────────┘
```

## Backend

- `server/src/index.ts` — Express app, security headers, routers, static client.
- `server/src/db.ts` + `server/src/migrate.ts` — one interface over PostgreSQL
  (`pg`) and embedded SQLite (`node:sqlite`). Migrations live in
  `db/migrations` and are applied on boot.
- `server/src/auth.ts` — scrypt password hashing, signed session cookies
  stored in the `sessions` table, `requireAuth`, `requireAdmin`.
- `server/src/rate-limit.ts` — in-process token buckets, optionally backed by
  Redis for multi-node deployments.
- `server/src/tickets.ts` — one-time stream tickets (60s TTL), in memory or
  Redis.
- `server/src/device/*` — provider abstraction:
  - `catalog.ts` defines Android profiles and plans.
  - `adb.ts` wraps screencap, tap/swipe, key/text input, APK install and push.
  - `emulator.ts` creates/launches/stops/deletes AVDs and polls boot state.
  - `demo.ts` provides clearly-labelled illustrative devices; external devices
    are attached through `adb.ts` using `ANDROID_SERIAL`.
  - `manager.ts` selects a provider, enforces concurrency and storage limits,
    records usage and reconciles state with the runtime on every list.
- `server/src/stream.ts` — WebSocket gateway for `/api/v1/ws/stream`.

## Streaming pipeline

1. The client requests `POST /api/v1/devices/:id/stream-ticket`. The server
   verifies ownership, confirms the device is running and mints a single-use
   ticket (60s TTL, scoped to one device).
2. The client opens `wss://…/api/v1/ws/stream?ticket=…`. The gateway consumes
   the ticket (single use, so it cannot be replayed) and pins the socket to the
   resolved device serial.
3. A capture loop runs `adb exec-out screencap -p`, sends a small JSON
   `frame` message (sequence, timestamp, width, height) followed by the binary
   PNG. The client draws it to a `<canvas>`.
4. The client measures end-to-end latency and frame rate locally and renders a
   quality indicator. The gateway also emits periodic `stats`.
5. Input messages (`input`, `key`, `text`, `rotate`) are validated, clamped to
   the current frame bounds and dispatched through `adb`.

The canvas scales responsively while pointer events are mapped back to Android
pixel coordinates. Screen size is taken from the decoded frame, so rotation and
different devices are handled without hard-coded dimensions.

### Fidelity note

The capture path is real (`adb` screencap + input injection). Frame rate is
bounded by emulator screenshot latency on a software-rendered headless host;
the UI surfaces this honestly as the stream quality indicator rather than hiding
it. With the official Google Play image installed, set `GMS_AVAILABLE=1` and
devices are labelled **Google Play · GMS**; AOSP images are labelled
**AOSP · no GMS**. CloudDroid never imitates Google services — Play Store and
sign-in run inside the real image.

## Data model

| Table       | Purpose                                             |
| ----------- | --------------------------------------------------- |
| `users`     | Account, role, plan, password hash                  |
| `plans`     | Device/concurrency/storage/hour limits and price    |
| `sessions`  | Server-side session records for cookies             |
| `devices`   | Phone metadata, provider, `avd_name`, status        |
| `files`     | Uploaded artifacts with per-user storage accounting |
| `activity`  | Human-readable workspace timeline                   |
| `audit_log` | Append-only administrative/security events          |
| `usage`     | Per-device runtime minutes and session counts       |
| `invoices`  | Billing preview records                             |

## Frontend

- `client/App.tsx` — routes and authentication guard.
- `client/components/AppShell.tsx` — responsive authenticated shell.
- `client/pages/Workspace.tsx` — streaming canvas, input mapping, device
  controls, connection diagnostics.
- TanStack Query caches server state; the API client injects credentials and
  normalises `/api/v1` paths.

## Provider selection

`manager.ts` chooses a provider from `CLOUDDROID_PROVIDER` and the runtime
health:

- `emulator` — manage AVDs named after the device id.
- `external` — attach to `ANDROID_SERIAL`, autostarting when allowed.
- `demo` — deterministic, clearly-labelled devices for UI work.
- `auto` — emulator when the SDK and `adb` are usable, otherwise demo.

Every device records which provider served it, and the UI renders the LIVE vs
DEMO distinction from that value plus `is_demo`.
