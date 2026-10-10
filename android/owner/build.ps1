$ErrorActionPreference = 'Stop'
if (!$env:ANDROID_SDK_ROOT) { throw 'Set ANDROID_SDK_ROOT; JDK 17 and Gradle 8.11.1 are also required.' }
Push-Location (Join-Path $PSScriptRoot '..')
try {
 & gradle :owner:assembleDebug --no-daemon
 if ($LASTEXITCODE -ne 0) { throw 'Android build failed' }
 Copy-Item -LiteralPath owner/build/outputs/apk/debug/owner-debug.apk -Destination owner/build/Mazraaty-Owner-test.apk -Force
 & "$env:ANDROID_SDK_ROOT/build-tools/35.0.0/apksigner.bat" verify --verbose owner/build/Mazraaty-Owner-test.apk
 if ($LASTEXITCODE -ne 0) { throw 'APK signature verification failed' }
} finally { Pop-Location }
