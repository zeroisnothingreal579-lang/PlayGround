# Getting started

This guide takes you from a clean checkout to a running CloudDroid instance with
a real, streamable Android phone.

## 1. Requirements

- Node.js 22+
- PostgreSQL 14+ (optional; SQLite works out of the box)
- Redis 6+ (optional; enables shared stream tickets)
- Android SDK with `platform-tools`, `emulator` and an x86_64 system image
- Linux host with KVM access (`/dev/kvm`) for a usable emulator

## 2. Install

```bash
cp .env.example .env
npm install
```

Set at least a real `JWT_SECRET`:

```bash
openssl rand -hex 32
```

## 3. Configure the runtime provider

`CLOUDDROID_PROVIDER` controls where Android phones come from:

| Value      | Behaviour                                                                 |
| ---------- | ------------------------------------------------------------------------- |
| `auto`     | Managed emulator when the Android SDK is present, otherwise demo devices. |
| `emulator` | CloudDroid manages one AVD per phone.                                     |
| `external` | Attach to an already-running adb device (`ANDROID_SERIAL`).               |
| `demo`     | Clearly-labelled demo devices only; no Android runtime.                   |

Relevant variables:

```dotenv
CLOUDDROID_PROVIDER=emulator
ANDROID_HOME=/home/runner/android-sdk
ANDROID_AVD_IMAGE=system-images;android-35;default;x86_64
ANDROID_AVD_DEVICE=pixel_6
ANDROID_MAX_RUNNING=2
GMS_AVAILABLE=0
```

## 4. Install the Android SDK (live mode)

```bash
export ANDROID_HOME="$HOME/android-sdk"
scripts/create-avd.sh clouddroid_demo
```

The script installs `platform-tools`, `emulator` and the system image, then
creates the `clouddroid_demo` AVD. Boot it manually to confirm KVM works:

```bash
emulator -avd clouddroid_demo -no-window -no-audio -no-boot-anim \
  -gpu swiftshader_indirect -port 5554 &
adb wait-for-device
adb shell getprop sys.boot_completed   # prints 1 when booted
```

If `/dev/kvm` is not writable, grant access (or ask your administrator):

```bash
sudo chmod 666 /dev/kvm
```

## 5. Run

```bash
npm run build
npm start
```

Then:

1. Open <http://localhost:3000>.
2. Sign in with `demo@clouddroid.app` / `CloudDroid123!`.
3. Open **Aurora One** — it attaches to the booted emulator and streams live.
4. Use **Create phone** to provision another isolated Android instance.

To reset the database, delete `var/clouddroid.db` (SQLite) or drop and recreate
the PostgreSQL schema; migrations and seed run automatically on boot.

## 6. Troubleshooting

| Symptom                              | Fix                                                                 |
| ------------------------------------ | ------------------------------------------------------------------- |
| Runtime shows `degraded`/`demo`      | `adb` not found or no booted device. Check `ANDROID_HOME` and `adb devices`. |
| Phone stuck in `starting`            | First boot can take minutes; watch server logs and `ANDROID_BOOT_TIMEOUT_MS`. |
| Stream connects but no frames        | Confirm the emulator boots (`adb shell getprop sys.boot_completed`). |
| `KVM is not available`               | Enable virtualization and `chmod 666 /dev/kvm`.                     |
| Stream tickets fail behind a proxy   | Ensure WebSocket upgrade headers are forwarded.                     |
