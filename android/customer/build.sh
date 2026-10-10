#!/usr/bin/env bash
set -euo pipefail
: "${ANDROID_SDK_ROOT:?Set ANDROID_SDK_ROOT}"
cd "$(dirname "$0")/.."
gradle :customer:assembleDebug --no-daemon
cp customer/build/outputs/apk/debug/customer-debug.apk customer/build/Mazraaty-Customer-test.apk
"$ANDROID_SDK_ROOT/build-tools/36.0.0/apksigner" verify --verbose customer/build/Mazraaty-Customer-test.apk
"$ANDROID_SDK_ROOT/build-tools/36.0.0/aapt2" dump badging customer/build/Mazraaty-Customer-test.apk
