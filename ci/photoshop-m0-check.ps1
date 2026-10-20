param(
  [Parameter(Mandatory = $true)]
  [string]$PatchyRoot,
  [Parameter(Mandatory = $true)]
  [string]$ArtifactDir,
  [Parameter(Mandatory = $true)]
  [string]$StudioRoot
)

$ErrorActionPreference = "Stop"
$psd = Join-Path $ArtifactDir "m0-normalized.psd"
$checker = Join-Path $PatchyRoot "scripts\dev\photoshop-open-check.ps1"
$inventory = Join-Path $ArtifactDir "photoshop-inventory"
$log = Join-Path $ArtifactDir "photoshop-open-check.log"

if (-not (Test-Path -LiteralPath $psd -PathType Leaf)) {
  throw "Browser E2E output is missing: $psd"
}
if (-not (Test-Path -LiteralPath $checker -PathType Leaf)) {
  throw "Pinned Patchy Photoshop checker is missing: $checker"
}

Write-Host "Photoshop must run in an interactive Windows session."
Write-Host "Dialogs are not auto-dismissed. If Photoshop shows a warning, record it,"
Write-Host "dismiss it manually, and treat the M0 gate as failed."

$result = @(& $checker -Files @($psd) -InventoryDir $inventory)
$result | Set-Content -LiteralPath $log -Encoding UTF8
$cleanLine = "CLEAN $psd"
if ($result.Count -ne 1 -or $result[0] -ne $cleanLine) {
  throw "Photoshop compatibility gate failed. See $log"
}

Write-Host $cleanLine

$env:M0_ARTIFACT_DIR = (Resolve-Path -LiteralPath $ArtifactDir).Path
Set-Location (Join-Path $StudioRoot "poc\patchy-bridge")
npm run verify:evidence

