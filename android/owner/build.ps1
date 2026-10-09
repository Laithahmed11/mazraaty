$ErrorActionPreference = 'Stop'
if (!$env:ANDROID_SDK_ROOT) { throw 'Set ANDROID_SDK_ROOT to an Android SDK with build-tools 35.0.0 and platform android-35.' }
$taskJavaBin = if ($env:JAVA_HOME) { Join-Path $env:JAVA_HOME 'bin' } else { Split-Path (Get-Command javac.exe -ErrorAction Stop).Source }
$taskTools = Join-Path $env:ANDROID_SDK_ROOT 'build-tools/35.0.0'
$taskPlatform = Join-Path $env:ANDROID_SDK_ROOT 'platforms/android-35/android.jar'
function Invoke-AndroidTool([string]$Tool, [string[]]$Arguments) {
    & $Tool @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Tool failed with exit code $LASTEXITCODE" }
}
Push-Location $PSScriptRoot
try {
    New-Item -ItemType Directory -Force build/compiled,build/classes,build/dex,assets | Out-Null
    Invoke-AndroidTool "$taskTools/aapt2.exe" @('compile','--dir','res','-o','build/compiled')
    $taskFlat = @(Get-ChildItem build/compiled -Filter '*.flat' | ForEach-Object FullName)
    Invoke-AndroidTool "$taskTools/aapt2.exe" (@('link','-o','build/resources.apk','--manifest','AndroidManifest.xml','-I',$taskPlatform,'--auto-add-overlay') + $taskFlat + @('-A','assets'))
    Invoke-AndroidTool "$taskJavaBin/javac.exe" @('-encoding','UTF-8','-source','8','-target','8','-classpath',$taskPlatform,'-d','build/classes','src/com/mazraaty/owner/MainActivity.java')
    $taskClasses = @(Get-ChildItem build/classes/com/mazraaty/owner -Filter '*.class' | ForEach-Object FullName)
    Invoke-AndroidTool "$taskTools/d8.bat" (@('--min-api','24','--lib',$taskPlatform,'--output','build/dex') + $taskClasses)
    Copy-Item -LiteralPath build/resources.apk -Destination build/unsigned.apk -Force
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $taskZip = [IO.Compression.ZipFile]::Open((Join-Path $PSScriptRoot 'build/unsigned.apk'),[IO.Compression.ZipArchiveMode]::Update)
    try {
        $taskExisting = $taskZip.GetEntry('classes.dex')
        if ($taskExisting) { $taskExisting.Delete() }
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($taskZip,(Join-Path $PSScriptRoot 'build/dex/classes.dex'),'classes.dex',[IO.Compression.CompressionLevel]::Optimal) | Out-Null
    } finally { $taskZip.Dispose() }
    Invoke-AndroidTool "$taskTools/zipalign.exe" @('-f','-p','4','build/unsigned.apk','build/aligned.apk')
    if (!(Test-Path -LiteralPath ../test-signing.keystore)) {
        Invoke-AndroidTool "$taskJavaBin/keytool.exe" @('-genkeypair','-keystore','../test-signing.keystore','-storepass','android','-keypass','android','-alias','mazraaty-test','-dname','CN=Mazraaty Test,O=Mazraaty,C=IQ','-keyalg','RSA','-keysize','2048','-validity','10000')
    }
    Invoke-AndroidTool "$taskTools/apksigner.bat" @('sign','--ks','../test-signing.keystore','--ks-pass','pass:android','--key-pass','pass:android','--out','build/Mazraaty-Owner-test.apk','build/aligned.apk')
    Invoke-AndroidTool "$taskTools/apksigner.bat" @('verify','--verbose','build/Mazraaty-Owner-test.apk')
    Invoke-AndroidTool "$taskTools/aapt2.exe" @('dump','badging','build/Mazraaty-Owner-test.apk')
    Invoke-AndroidTool "$taskTools/zipalign.exe" @('-c','-p','4','build/Mazraaty-Owner-test.apk')
} finally { Pop-Location }
