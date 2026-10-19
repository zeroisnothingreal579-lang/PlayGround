# API reference

Base URL: `/api/v1`. Authentication uses an HTTP-only session cookie set by
`POST /auth/login`. A machine-readable description is served at
`GET /api/v1/openapi.json`.

All errors share the shape:

```json
{ "error": "Human readable message", "code": "machine_code" }
```

## System

| Method | Path                | Auth | Description                                |
| ------ | ------------------- | ---- | ------------------------------------------ |
| GET    | `/healthz`          | —    | Liveness, database backend and server time. |
| GET    | `/public/status`    | —    | Public runtime summary (mode, transport).  |
| GET    | `/plans`            | —    | Available plans.                           |
| GET    | `/system/runtime`   | —    | Runtime provider, GMS and booted devices.  |
| GET    | `/catalog`          | user | Android profiles and device options.       |
| GET    | `/usage`            | user | Current billing-period usage.              |
| GET    | `/activity`         | user | Workspace activity timeline.               |
| GET    | `/billing`          | user | Plan, usage and invoices.                  |
| POST   | `/billing/change-plan` | user | Switch plan (preview change).           |
| GET    | `/openapi.json`     | —    | This API as OpenAPI 3.1.                   |

## Authentication

| Method | Path                | Auth | Description                              |
| ------ | ------------------- | ---- | ---------------------------------------- |
| POST   | `/auth/register`    | —    | Create an account and start a session.   |
| POST   | `/auth/login`       | —    | Sign in.                                 |
| POST   | `/auth/logout`      | user | Revoke the current session.              |
| GET    | `/auth/me`          | user | Current user and plan.                   |
| PATCH  | `/auth/me`          | user | Update name/email.                       |
| POST   | `/auth/me/password` | user | Change password; revokes other sessions. |
| GET    | `/auth/sessions`    | user | List active sessions.                    |
| DELETE | `/auth/sessions/:id`| user | Revoke a session.                        |
| DELETE | `/auth/me`          | user | Delete the account and all data.         |

## Devices

| Method | Path                          | Auth | Description                          |
| ------ | ----------------------------- | ---- | ------------------------------------ |
| GET    | `/devices`                    | user | List phones (reconciled with runtime). |
| POST   | `/devices`                    | user | Create a phone.                      |
| GET    | `/devices/:id`                | user | Phone details.                       |
| PATCH  | `/devices/:id`                | user | Rename / change profile.             |
| DELETE | `/devices/:id`                | user | Delete the phone and its data.       |
| POST   | `/devices/:id/start`          | user | Boot Android.                        |
| POST   | `/devices/:id/stop`           | user | Stop Android.                        |
| POST   | `/devices/:id/restart`        | user | Restart Android.                     |
| GET    | `/devices/:id/status`         | user | Lightweight status poll.             |
| GET    | `/devices/:id/snapshot`       | user | Cached/live PNG snapshot.            |
| GET    | `/devices/:id/screenshot`     | user | Fresh PNG screenshot.                |
| POST   | `/devices/:id/stream-ticket`  | user | Mint a one-time streaming ticket.    |

Example ticket response:

```json
{
  "ticket": "…",
  "expiresAt": "2026-01-01T00:00:60.000Z",
  "wsPath": "/api/v1/ws/stream?ticket=…",
  "transport": "websocket-frames"
}
```

## Streaming WebSocket

Connect to `wsPath`. The gateway sends:

- `ready` — device, transport, codec, provider, android version.
- `frame` — JSON metadata immediately followed by a binary PNG.
- `stats` — periodic fps/sequence.
- `pong` — heartbeat response to `{ "type": "ping" }`.
- `input_error` — rejected input with a message.

Client messages:

| Message                                                         | Purpose               |
| --------------------------------------------------------------- | --------------------- |
| `{ "type": "input", "kind": "tap", "x": 0.5, "y": 0.5 }`          | Tap (normalised 0–1). |
| `{ "type": "input", "kind": "swipe", "x1":…, "y1":…, "x2":…, "y2":… }` | Swipe.          |
| `{ "type": "input", "kind": "longpress", "x":…, "y":… }`          | Long press.           |
| `{ "type": "key", "key": "HOME" }`                              | Key event.            |
| `{ "type": "text", "text": "hello" }`                           | Type text.            |
| `{ "type": "rotate" }`                                          | Rotate device.        |
| `{ "type": "ping" }`                                            | Heartbeat.            |

## Files

| Method | Path                    | Auth | Description                         |
| ------ | ----------------------- | ---- | ----------------------------------- |
| GET    | `/files`                | user | List all files for the user.        |
| GET    | `/devices/:id/files`    | user | Files for a device.                 |
| POST   | `/devices/:id/files`    | user | Upload (`multipart/form-data`, `file`). |
| GET    | `/files/:id/download`   | user | Download a file.                    |
| POST   | `/files/:id/install`    | user | Install an APK on its device.       |
| DELETE | `/files/:id`            | user | Delete a file.                      |

## Admin

Requires an admin account.

| Method | Path                | Description                          |
| ------ | ------------------- | ------------------------------------ |
| GET    | `/admin/overview`   | Fleet, runtime and recent audit.     |
| GET    | `/admin/users`      | Users with device counts.            |
| GET    | `/admin/devices`    | All devices with owners.             |
| GET    | `/admin/audit`      | Audit log.                           |
