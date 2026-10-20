#!/usr/bin/env bash
# Provision a headless Android emulator image for CloudDroid's live provider.
# Usage: scripts/create-avd.sh [avd_name] [api_level] [system_image]
set -euo pipefail

if [ -z "${ANDROID_HOME:-}" ]; then
  for candidate in /usr/local/lib/android/sdk /opt/android-sdk "$HOME/android-sdk"; do
    if [ -d "$candidate" ]; then ANDROID_HOME="$candidate"; break; fi
  done
fi
ANDROID_HOME="${ANDROID_HOME:-/usr/local/lib/android/sdk}"
export ANDROID_HOME
export ANDROID_SDK_ROOT="$ANDROID_HOME"
if [ -z "${ANDROID_AVD_HOME:-}" ]; then
  if [ -d "$HOME/.config/.android/avd" ]; then export ANDROID_AVD_HOME="$HOME/.config/.android/avd"
  elif [ -d "$HOME/.android/avd" ]; then export ANDROID_AVD_HOME="$HOME/.android/avd"; fi
fi
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"

AVD_NAME="${1:-clouddroid_play}"
API_LEVEL="${2:-35}"
IMAGE="${3:-system-images;android-${API_LEVEL};google_apis_playstore;x86_64}"

if ! command -v sdkmanager >/dev/null 2>&1; then
  echo "sdkmanager not found. Set ANDROID_HOME or install Android command line tools." >&2
  exit 1
fi

echo "[avd] installing platform tools, emulator and $IMAGE"
yes | sdkmanager --licenses >/dev/null
sdkmanager "platform-tools" "emulator" "$IMAGE"

if emulator -list-avds | grep -qx "$AVD_NAME"; then
  echo "[avd] $AVD_NAME already exists"
else
  echo "[avd] creating $AVD_NAME"
  echo no | avdmanager create avd -n "$AVD_NAME" -k "$IMAGE" -d pixel_6 --force
fi

echo "[avd] done. Boot with:"
echo "  emulator -avd $AVD_NAME -no-window -no-audio -no-boot-anim -gpu swiftshader_indirect -port 5554"
