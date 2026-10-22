param(
  [Parameter(Mandatory = $true)]
  [string]$PatchyRoot,
  [Parameter(Mandatory = $true)]
  [string]$StudioRoot,
  [Parameter(Mandatory = $true)]
  [string]$Fixture,
  [Parameter(Mandatory = $true)]
  [string]$ArtifactDir
)

$ErrorActionPreference = "Stop"
$expectedCommit = "d1ff95235e00af296868d4253e03391ca002ee9d"
Set-Location $PatchyRoot

$actualCommit = (git rev-parse HEAD).Trim()
if ($actualCommit -ne $expectedCommit) {
  throw "Expected Patchy $expectedCommit, got $actualCommit"
}
if (-not (Test-Path -LiteralPath $Fixture -PathType Leaf)) {
  throw "Fixture does not exist: $Fixture"
}
if ([IO.Path]::GetExtension($Fixture).ToLowerInvariant() -notin @(".psd", ".psb")) {
  throw "Fixture must be a PSD or PSB: $Fixture"
}
if (Test-Path -LiteralPath $ArtifactDir) {
  throw "ArtifactDir must be a new path so evidence cannot overwrite an earlier run: $ArtifactDir"
}

$bridgeRoot = Join-Path $StudioRoot "poc\patchy-bridge\patchy"
Copy-Item (Join-Path $bridgeRoot "web_bridge_wasm.hpp") "src\ui\web_bridge_wasm.hpp"
Copy-Item (Join-Path $bridgeRoot "web_bridge_wasm.cpp") "src\ui\web_bridge_wasm.cpp"
$wasmM0Root = "scripts\wasm\m0"
New-Item -ItemType Directory -Force -Path $wasmM0Root | Out-Null
Copy-Item (Join-Path $StudioRoot "poc\patchy-bridge\web\patchy-bridge.js") (Join-Path $wasmM0Root "patchy-bridge.js")
Copy-Item (Join-Path $StudioRoot "poc\patchy-bridge\web\m0-harness.js") (Join-Path $wasmM0Root "m0-harness.js")
git apply --check (Join-Path $bridgeRoot "integration.patch")
git apply (Join-Path $bridgeRoot "integration.patch")

foreach ($command in @("git", "pwsh", "node")) {
  if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
    throw "Missing required command: $command"
  }
}

# These are the upstream-pinned dependency installers. Run on a disposable,
# licensed Windows x64 CI worker with the Visual Studio version required by
# docs/wasm.md and enough disk space for Qt/Emscripten.
pwsh -File scripts/wasm/setup-emsdk.ps1
pwsh -File scripts/wasm/setup-qt-wasm.ps1

# The upstream release script configures wasm-release, requires AI-selection
# assets, builds, and stages the web package. Its output must not be interpreted
# as an E2E pass until the browser round trip below also succeeds.
cmd /s /c scripts/release/build-wasm.bat

# build-wasm.bat produces the plain Qt site; the ?m0=1 verification entry point
# only exists after the bridge scripts are staged into it.
node (Join-Path $StudioRoot "poc\patchy-bridge\scripts\stage-dev-site.mjs") (Join-Path $PatchyRoot "build\package\wasm-site")

$env:PATCHY_ROOT = $PatchyRoot
$env:PATCHY_WASM_SITE = Join-Path $PatchyRoot "build\package\wasm-site"
$env:M0_PSD_FIXTURE = (Resolve-Path -LiteralPath $Fixture).Path
$env:M0_ARTIFACT_DIR = $ArtifactDir
$env:M0_PATCHY_COMMIT = $actualCommit
Set-Location (Join-Path $StudioRoot "poc\patchy-bridge")
npm ci
npx playwright install chromium
npm run test:e2e

Write-Host "Browser evidence written to $ArtifactDir."
Write-Host "M0 is still not passed until Photoshop opens m0-normalized.psd"
Write-Host "with dialogs enabled and no repair, unknown-data, or discard-data warning."

