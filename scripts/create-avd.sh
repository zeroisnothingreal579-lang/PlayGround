#!/usr/bin/env bash
# Provision a headless Android emulator image for CloudDroid's live provider.
# Usage: scripts/create-avd.sh [avd_name] [api_level] [system_image]
set -euo pipefail

ANDROID_HOME="${ANDROID_HOME:-/home/runner/android-sdk}"
export ANDROID_HOME
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"

AVD_NAME="${1:-clouddroid_demo}"
API_LEVEL="${2:-35}"
IMAGE="${3:-system-images;android-${API_LEVEL};default;x86_64}"

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
