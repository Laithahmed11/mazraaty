#!/usr/bin/env bash
set -euo pipefail
: "${ANDROID_SDK_ROOT:?Set ANDROID_SDK_ROOT}"
cd "$(dirname "$0")/.."
gradle :owner:assembleDebug --no-daemon
cp owner/build/outputs/apk/debug/owner-debug.apk owner/build/Mazraaty-Owner-test.apk
"$ANDROID_SDK_ROOT/build-tools/36.0.0/apksigner" verify --verbose owner/build/Mazraaty-Owner-test.apk
"$ANDROID_SDK_ROOT/build-tools/36.0.0/aapt2" dump badging owner/build/Mazraaty-Owner-test.apk
