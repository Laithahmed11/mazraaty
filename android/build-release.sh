#!/usr/bin/env bash
set -euo pipefail
: "${MAZRAATY_LAUNCH_HOST:?Set the verified launch hostname}"
: "${MAZRAATY_KEYSTORE:?Set the PRIVATE upload keystore path}"
: "${MAZRAATY_STORE_PASSWORD:?Set privately}"
: "${MAZRAATY_KEY_ALIAS:?Set privately}"
: "${MAZRAATY_KEY_PASSWORD:?Set privately}"
cd "$(dirname "$0")"
LAUNCH_SITE_URL="https://$MAZRAATY_LAUNCH_HOST" bun ../website/app/scripts/check-launch.mjs
gradle :customer:bundleRelease :owner:bundleRelease -PsiteHost="$MAZRAATY_LAUNCH_HOST" --no-daemon
echo 'Signed release bundles generated in each app build/outputs/bundle/release. No publication performed.'
