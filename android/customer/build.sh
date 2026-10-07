#!/usr/bin/env bash
set -euo pipefail
: "${ANDROID_SDK_ROOT:?Set ANDROID_SDK_ROOT}"
cd "$(dirname "$0")"
BT="$ANDROID_SDK_ROOT/build-tools/35.0.0"
PLATFORM="$ANDROID_SDK_ROOT/platforms/android-35/android.jar"
mkdir -p build/compiled build/classes build/dex assets
"$BT/aapt2" compile --dir res -o build/compiled
"$BT/aapt2" link -o build/resources.apk --manifest AndroidManifest.xml -I "$PLATFORM" --auto-add-overlay build/compiled/*.flat -A assets
javac -encoding UTF-8 -source 8 -target 8 -classpath "$PLATFORM" -d build/classes src/com/mazraaty/customer/MainActivity.java
"$BT/d8" --min-api 24 --lib "$PLATFORM" --output build/dex build/classes/com/mazraaty/customer/*.class
cp build/resources.apk build/unsigned.apk
(cd build/dex && zip -q ../unsigned.apk classes.dex)
"$BT/zipalign" -f -p 4 build/unsigned.apk build/aligned.apk
if [ ! -f ../test-signing.keystore ]; then keytool -genkeypair -keystore ../test-signing.keystore -storepass android -keypass android -alias mazraaty-test -dname 'CN=Mazraaty Test,O=Mazraaty,C=IQ' -keyalg RSA -keysize 2048 -validity 10000; fi
"$BT/apksigner" sign --ks ../test-signing.keystore --ks-pass pass:android --key-pass pass:android --out build/Mazraaty-Customer-test.apk build/aligned.apk
"$BT/apksigner" verify --verbose build/Mazraaty-Customer-test.apk
"$BT/aapt2" dump badging build/Mazraaty-Customer-test.apk

