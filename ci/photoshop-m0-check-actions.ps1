param(
  [Parameter(Mandatory = $true)]
  [string]$ArtifactDir,
  [Parameter(Mandatory = $true)]
  [string]$StudioRoot,
  [int]$OpenTimeoutSec = 120
)

$ErrorActionPreference = "Stop"
$psd = Join-Path $ArtifactDir "m0-normalized.psd"
$checker = Join-Path $StudioRoot "ci\photoshop-open-check-actions.ps1"
$log = Join-Path $ArtifactDir "photoshop-open-check.log"
$driverRecord = Join-Path $ArtifactDir "photoshop-open-check-driver.json"

if (-not (Test-Path -LiteralPath $psd -PathType Leaf)) {
  throw "Browser E2E output is missing: $psd"
}
if (-not (Test-Path -LiteralPath $checker -PathType Leaf)) {
  throw "Photoshop action-automation checker is missing: $checker"
}

$ps = @(Get-Process Photoshop -ErrorAction SilentlyContinue)
if ($ps.Count -ne 1) {
  throw "Expected exactly one running Photoshop instance, found $($ps.Count). Start Photoshop first."
}
$version = $ps[0].MainModule.FileVersionInfo.FileVersion

Write-Host "Driver: legacy action automation (Photoshop.Application.200.1)."
Write-Host "The pinned ExtendScript checker is unavailable on this host; see ci/photoshop-open-check-actions.ps1."
Write-Host "Dialogs are never auto-dismissed. If Photoshop shows a warning, record it,"
Write-Host "dismiss it manually, and treat the M0 gate as failed."

$result = @(& $checker -Files @($psd) -OpenTimeoutSec $OpenTimeoutSec)
$result | Set-Content -LiteralPath $log -Encoding UTF8
$cleanLine = "CLEAN $psd"
if ($result.Count -ne 1 -or $result[0] -ne $cleanLine) {
  throw "Photoshop compatibility gate failed. See $log"
}

@{
  driver = "legacy-action-automation"
  class = "Photoshop.Application.200.1"
  photoshopVersion = $version
  dialogs = "default (visible)"
  pinnedCheckerAvailable = $false
  pinnedCheckerReason = "ScriptingSupport commands unavailable; Photoshop.Application never registers in the ROT"
  checkedAt = (Get-Date).ToString("o")
  input = $psd
  verdict = $cleanLine
} | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $driverRecord -Encoding UTF8

Write-Host $cleanLine

$env:M0_ARTIFACT_DIR = (Resolve-Path -LiteralPath $ArtifactDir).Path
Set-Location (Join-Path $StudioRoot "poc\patchy-bridge")
npm run verify:evidence
