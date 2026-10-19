# Replica Studio

A working, dark-themed workspace for running the eleven [Replica](https://github.com/Jakeschincariol/replica-skill) skills individually or as a dependency-aware pipeline.

Replica Studio loads the real `SKILL.md` files, scripts, and repository ordering from GitHub. It keeps durable project files and step outputs in SQLite, calls an AI provider entirely from the server, shows live execution over SSE, and exports generated work as a ZIP.

> Replica is for clean-room replication of functionality. Use public pages or your own account only. Do not bypass authentication, paywalls, or access controls, and do not copy proprietary source, copy, assets, or logos.

## Quick start

Requirements: Node 22+, npm 10+, and optionally Docker for sandboxed scripts.

```bash
npm install
cp .env.example .env.local
npm run db:migrate
npm run dev
```

Open <http://localhost:3000>.

The app starts in real mode. Add a provider key to `.env.local`, or enable **Demo previews** in Settings to exercise the UI without making model calls. Demo mode is always labelled and never claims that real AI work happened.

### AI providers

Set one or more server-side keys:

```dotenv
AI_PROVIDER=openai          # optional; otherwise auto-detect from configured keys
AI_MODEL=gpt-4.1-mini
OPENAI_API_KEY=...
```

Supported: `openai`, `anthropic`, `openrouter`, `groq`, `ollama`, `demo`.
Keys are read only by server code (`lib/ai/providers.ts`); they are never sent to the browser. Settings shows whether each key exists, not its value.

For Ollama, uncomment `OLLAMA_BASE_URL` in `.env.local`; a set URL makes Ollama count as a configured provider. Leave it commented out if you want Demo mode to be selected when no API key exists.

### Sandboxed script execution

Scripts from a skill require explicit per-project approval. Docker execution uses:

- `--network none`
- read-only root and a read-only `/work` mount
- memory, CPU, and PID limits
- `--cap-drop ALL` and `no-new-privileges`
- a hard timeout

```bash
docker pull python:3.12-alpine
```

`SANDBOX_MODE=disabled` or an unavailable Docker daemon does not block planning, code generation, or ZIP export. Those runs remain available and script execution is reported as unavailable. The default `python:3.12-alpine` image supports `.py`, `.sh`, and `.bash`. JavaScript (`.js`, `.mjs`, `.cjs`) requires a Node-based `SANDBOX_IMAGE` with Node installed.

## What is implemented

- **Dashboard** with workspace statistics, recent activity, active workflows, and recent runs.
- **Projects** with website and/or Android APK targets, a file workspace, file editor, assistant chat, plans, logs, tests, and run history.
- **APK target workflow** with private streaming upload, drag/drop progress, persistent background static analysis, manifest/resource/structure reports, retry, and downloadable JSON/Markdown results. APKs are never installed or executed.
- **Skills library** with all 11 real skills, instructions, support files, scripts, dependency badges, run history, manual sync, and individual runs.
- **Pipeline planner** that parses the repository README order, derives dependencies from each skill's text, pulls prerequisites into subsets, detects cycles, and estimates input tokens.
- **Pipeline execution** that runs sequentially, passes upstream outputs and relevant files forward, and persists every step.
- **Run controls** for start, pause, resume, cancel, retry, skip-and-continue, and rerun. A step is never reported complete unless execution succeeded.
- **Live updates** through a server-sent-events snapshot stream.
- **Durable storage** in SQLite/WAL for projects, files, skills, runs, steps, logs, activities, settings, and script approvals.
- **ZIP export** with all generated project files plus an auditable manifest.
- **Server-only configuration** for GitHub, AI, sandbox limits, and storage.

## How skills are loaded

`lib/skills/loader.ts` asks the GitHub API for the repository tree, commit SHA, README, and every file under `replica-*/`. If GitHub is unavailable, it uses the last successfully loaded skills or the bundled snapshot in `content/replica-skill` (commit `77c9436fb3d18c3d58169efb8caf4fe906b0dc51`). The UI shows a warning whenever fallback data is used. There are no fake placeholder skills.

Set `SKIP_GITHUB_SYNC=true` to use the cached/bundled pack without network access.

## Pipeline behavior

1. The README sequence provides a stable baseline order.
2. `lib/skills/dependencies.ts` extracts prerequisites from artifact references (for example `replica/architecture.md`) and explicit "after / requires" phrasing.
3. Selecting a skill automatically adds its prerequisites.
4. A stable topological sort places prerequisites first; cycles are reported rather than silently accepted.
5. Each step receives project metadata, relevant files, recent upstream outputs, and static APK analysis when an APK target is attached.
6. Outputs, logs, token estimates, errors, and timestamps are saved after every step.
7. Pause finishes the active step and preserves completed outputs. Cancel aborts an in-flight model request. Retry resets one step and its downstream state. Skip-and-continue lets downstream steps run with incomplete input, clearly marked.

## Storage

Local SQLite is the active, durable store. The default path is `./data/replica-studio.db`; override it with `DATABASE_PATH`. Migrations run automatically on first access and can also be applied with:

```bash
npm run db:migrate
```

APK files use a private file-backed store (`APK_STORAGE_DIR`, default `./data/apk-storage`) with opaque keys and `0600` files. Uploads are streamed with a configurable `APK_MAX_UPLOAD_BYTES` limit (default 500 MB) and served only through single-user API routes—not a public directory. The APK binary is not stored in SQLite and is not included in ZIP exports; static analysis reports are.

`supabase/migrations/0001_replica_studio.sql` is an optional Postgres mirror for a future hosted adapter. **Supabase is not wired into the runtime data layer.** The app does not claim a Supabase connection unless one is implemented and configured.

## API

| Route | Purpose |
| --- | --- |
| `/api/projects` | List/create projects |
| `/api/projects/[id]` | Read/update/delete a project |
| `/api/projects/[id]/files` | List/read/create/delete project files |
| `/api/projects/[id]/chat` | Project assistant, with controlled file writes |
| `/api/projects/[id]/apk` | Upload/replace/remove a private APK target |
| `/api/projects/[id]/apk/analysis` | Poll APK analysis status and logs |
| `/api/projects/[id]/apk/analysis/retry` | Re-queue static APK analysis |
| `/api/projects/[id]/apk/analysis/report` | Download JSON or Markdown analysis report |
| `/api/projects/[id]/apk/file` | Download the private APK |
| `/api/projects/[id]/export` | Stream a ZIP of generated work and APK reports |
| `/api/skills`, `/api/skills/[slug]` | Load skill pack or one skill |
| `/api/skills/[slug]/run` | Start an individual skill run |
| `/api/pipelines`, `/api/pipelines/plan` | Create a pipeline and preview plans |
| `/api/runs`, `/api/runs/[id]` | List/read runs |
| `/api/runs/[id]/stream` | SSE run snapshots |
| `/api/runs/[id]/control` | Start/pause/resume/cancel/retry/continue |
| `/api/runs/[id]/rerun` | Create a rerun of an individual skill |
| `/api/settings`, `/api/settings/clear-history` | Read/update settings, clear history |
| `/api/sandbox`, `/api/sandbox/approve`, `/api/sandbox/execute` | Sandbox status, approval, execution |

## Security notes

- AI keys stay in server environment variables.
- The app writes only under the project data model; generated paths reject absolute paths, `..`, empty segments, and `.env*`.
- AI-created files are limited to 2 MB and paths to 400 characters.
- Scripts run only after explicit approval and only from the loaded skill's classified script list.
- APK analysis is static only. Uploaded APKs are never installed or executed; reports must not be read as proof of runtime behavior.
- Docker execution is locked down as described above. If Docker is unavailable, execution fails closed.
- There is no user authentication or tenancy layer. Run it as a private, single-user workspace. Add auth and per-user ownership before exposing it publicly.
- The target application is never scraped by these APIs; model output and user-provided files are the only content stored.

## Tests

```bash
npm test          # Vitest: loader, dependencies, planner, AI providers, executor, pipeline, export, sandbox gates
npm run typecheck
npm run lint
npm run build
npm run test:e2e  # Playwright: dashboard, skills, settings, project creation, individual run, full pipeline
RUN_SANDBOX=1 npm test -- tests/sandbox.test.ts  # real Docker isolation check (requires the image)
```

E2E runs against a development server with `DEMO_MODE=true` and `SKIP_GITHUB_SYNC=true`, so no paid AI calls or GitHub dependency are required. Chromium runs the full workflows; tablet checks core rendering.

## Acceptance walkthrough

1. Open **Settings** and confirm the repository source and provider state.
2. Create a project with a target URL and requirements.
3. Open **Skills**, inspect `replica-recon`, and run it against the project. In demo mode the run is labelled **Demo preview — no AI call**.
4. Watch the run complete, inspect **AI response**, **Generated files**, and **Logs**.
5. Open **Full Pipeline**, enter requirements, review the 11-step dependency plan, and start it.
6. Confirm every step completes and artifacts accumulate in the project workspace.
7. Export the project ZIP and inspect the manifest.
8. If Docker and an image are present, approve and execute a `.py` skill script; otherwise confirm the unavailable message.

## Deployment notes

- SQLite and Docker need a persistent host (VPS, container, or long-running Node process). Serverless platforms with ephemeral filesystems are not a drop-in fit.
- Use an absolute `DATABASE_PATH` on a persistent volume and back it up.
- Put the app behind authentication before exposing it to the internet.
- If Docker is unavailable in production, set `SANDBOX_MODE=disabled`; generated output and export continue to work.
- Production build: `npm run build && npm start`.
- Standalone file tracing includes `content/replica-skill/**` so the bundled fallback survives deployment.

## Project layout

```
app/                    Pages and API routes
components/             UI, workspace, runs, skills, pipeline, settings
lib/ai/                 Server-only provider adapters
lib/apk/                Private APK storage, static analysis, queue, prompt context
lib/db/                 SQLite schema and repository layer
lib/pipeline/           Planner and runner
lib/runs/               Prompt construction and skill executor
lib/skills/             GitHub/bundled loader and dependency analysis
content/replica-skill/  Pinned upstream snapshot with SNAPSHOT.json
scripts/migrate.mjs     Applies the SQLite schema
supabase/migrations/    Optional Postgres schema (not wired)
tests/                  Vitest and Playwright suites
```
