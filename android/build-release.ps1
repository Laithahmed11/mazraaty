param([Parameter(Mandatory=$true)][string]$LaunchHost)
$ErrorActionPreference='Stop'
if($LaunchHost -notmatch '^[a-z0-9]+([.-][a-z0-9]+)+$' -or $LaunchHost.Contains('preview')){throw 'Set the verified launch hostname'}
$privatePath=Join-Path $PSScriptRoot '.private-signing/signing.local.json'
if(!(Test-Path -LiteralPath $privatePath)){throw 'Private permanent upload key missing'}
$signing=Get-Content -LiteralPath $privatePath -Raw | ConvertFrom-Json
$names=@('MAZRAATY_KEYSTORE','MAZRAATY_STORE_PASSWORD','MAZRAATY_KEY_ALIAS','MAZRAATY_KEY_PASSWORD')
Push-Location $PSScriptRoot
try{
 $env:LAUNCH_SITE_URL="https://$LaunchHost"
 & bun ../website/app/scripts/check-launch.mjs
 if($LASTEXITCODE -ne 0){throw 'Launch readiness check failed; do not build a store release yet'}
 foreach($name in $names){[Environment]::SetEnvironmentVariable($name,$signing.$name,'Process')}
 & gradle :customer:bundleRelease :owner:bundleRelease "-PsiteHost=$LaunchHost" --no-daemon
 if($LASTEXITCODE -ne 0){throw 'Signed release bundle build failed'}
 Write-Output 'Signed release AABs generated; no publication performed.'
}finally{
 foreach($name in $names){[Environment]::SetEnvironmentVariable($name,$null,'Process')}
 [Environment]::SetEnvironmentVariable('LAUNCH_SITE_URL',$null,'Process')
 Pop-Location
}
