# CloudDroid

CloudDroid is a full-stack platform for creating, booting, streaming and
managing **real cloud-hosted Android phones** from the browser. It provisions
genuine Android emulator instances on KVM, streams the live framebuffer over an
authenticated WebSocket and pushes touch, key and text input back into Android
through `adb`. The default image is the official Google Play build, so phones
include Play Store and Google Play Services.

It is honest about its runtime: phones backed by a real Android instance are
labelled **LIVE**, while seeded illustrative devices are labelled **DEMO** and
never claim to be a live runtime.

## Highlights

- **Real Android runtime** — managed AVD per phone, boot verification via
  `sys.boot_completed`, start/stop/restart/delete lifecycle.
- **Live streaming** — PNG frames over a one-time-ticket WebSocket, with tap,
  swipe, long-press, key, text and rotation input forwarded through `adb`.
- **Billing & limits** — plans define phone count, concurrency, storage and
  runtime hours; usage is metered per session.
- **File transfer** — per-user uploads with storage accounting, plus APK
  install (`pm install -r`) and push to `/sdcard/Download`.
- **Admin console** — fleet, users, runtime health and an append-only audit log.
- **Portable data layer** — PostgreSQL in production, embedded SQLite for a
  single-node install; optional Redis for shared stream tickets.
- **Security** — scrypt password hashing, HTTP-only sessions, per-user
  ownership checks, CSRF origin validation, rate limits and security headers.

## Stack

| Layer      | Technology                                        |
| ---------- | ------------------------------------------------- |
| Frontend   | React 18, Vite, TypeScript, Tailwind, TanStack Query |
| Backend    | Node.js 22, Express, TypeScript, `ws`             |
| Data       | PostgreSQL or `node:sqlite`, optional Redis       |
| Runtime    | Android SDK / emulator on KVM, driven by `adb`    |

## Quick start

```bash
cp .env.example .env          # set JWT_SECRET and CLOUDDROID_PROVIDER
npm install
npm run build
npm start                     # serves app + API on http://localhost:3000
```

For a live runtime, install the Android SDK and the official Google Play system
image, then:

```bash
scripts/create-avd.sh clouddroid_play
CLOUDDROID_PROVIDER=emulator npm start
```

To run AOSP instead (no Play Store or Google Play Services), install
`system-images;android-35;default;x86_64`, set
`ANDROID_AVD_IMAGE`/`ANDROID_AVD_NAME` accordingly and set `GMS_AVAILABLE=0`.

Open <http://localhost:3000> and sign in with the seeded demo account:

- **User**: `demo@clouddroid.app` / `CloudDroid123!`
- **Admin**: `admin@clouddroid.app` / `CloudDroid123!`

See [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md) for the full setup,
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how streaming works and
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) to run it in production.

## Scripts

| Command             | Purpose                                        |
| ------------------- | ---------------------------------------------- |
| `npm run dev`       | Vite dev server + API via `tsx watch`          |
| `npm run build`     | Build the client and compile the server        |
| `npm start`         | Run the production server on `PORT` (3000)     |
| `npm run typecheck` | Type-check client and server                   |
| `./start.sh`        | Install/build if needed, then serve on `PORT`  |
| `npm run test:smoke`| End-to-end smoke test against a running server |
| `./capture.sh`      | Screenshot the running app                     |

## Documentation

- [Getting started](docs/GETTING_STARTED.md)
- [Architecture](docs/ARCHITECTURE.md)
- [API reference](docs/API.md) · machine-readable at `/api/v1/openapi.json`
- [Deployment](docs/DEPLOYMENT.md)

## License

MIT
