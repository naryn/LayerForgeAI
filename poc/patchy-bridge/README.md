# Patchy browser bridge M0 PoC

This directory is a deliberately small bridge experiment, not an application.

- `web/patchy-bridge.js` is executable and dependency-free. It only exchanges
  JSON through page-owned arrays.
- `web/M0BridgeProbe.vue` shows the intended Vue 3 sequence: stage/open, inspect
  the recursive layer JSON, render `before.png`, rename one layer, save to a new
  PSD, close/reopen that copy, verify the new name, and render `after.png`.
- `patchy/web_bridge_wasm.*` is the Patchy-side adapter. It polls with a
  Qt `QTimer` and invokes only APIs verified at the pinned Patchy commit. It
  compiles and links into the real `wasm-release` UI target on macOS.
- `patchy/integration.patch` contains the exact CMake/MainWindow wiring against
  the pinned commit. `PROTOCOL.md` defines protocol v1, preconditions and errors.

Run the browser-side unit tests:

```sh
cd poc/patchy-bridge
npm test
```

The Windows E2E uses the exact Playwright 1.64.1 dependency from
`package-lock.json` (Apache-2.0) and an approved PSD/PSB fixture:

```powershell
pwsh -File ci\windows-wasm-m0.ps1 `
  -PatchyRoot C:\work\Patchy `
  -StudioRoot C:\work\LayerForgeAI `
  -Fixture C:\fixtures\approved-100-layers.psd `
  -ArtifactDir C:\evidence\m0-20261020-001
```

The artifact directory must not already exist. The test captures the saved PSD,
before/after PNGs, RGBA pixel hashes, source/output hashes, reopened screenshot,
browser console, manifest, and Playwright trace. It also asserts eight real-WASM
protocol boundaries: missing/stale preconditions, escaped output paths,
non-staged input paths, unknown operations, preview/PSD overwrite refusal, and
an unchanged automation fingerprint after every rejected request. Afterwards,
in an interactive Windows session with Photoshop installed:

```powershell
pwsh -File ci\photoshop-m0-check.ps1 `
  -PatchyRoot C:\work\Patchy `
  -ArtifactDir C:\evidence\m0-20261020-001 `
  -StudioRoot C:\work\LayerForgeAI
```

That check deliberately does not auto-dismiss Photoshop warnings. A `CLEAN`
result then runs the independent evidence verifier, which recomputes file hashes
and PNG RGBA hashes and writes `evidence-verification.json`.

macOS can reproduce the build and browser round trip without claiming the
Photoshop gate:

```sh
ci/macos-wasm-m0.sh \
  /path/to/Patchy /path/to/LayerForgeAI \
  tests/fixtures/m0-synthetic-125-layers.psd \
  /evidence/m0-20261020-001
```

The macOS evidence uses a 29-layer real PSD from Patchy's upstream
`test-fixtures` (not distributed with the application) and a 130-layer
synthetic stress sample. Neither substitutes for the 100+ layer approved
design sample required by M1. `verify:browser-evidence` checks the saved 8BPS
header, hashes, reopened screenshot, console, and independently decoded RGBA
equality, then writes `browser-evidence-verification.json` with
`photoshopVerified: false` and `m0Accepted: false`.

The integration adapter is already applied to this workspace's vendor checkout.
For a fresh checkout, add the two C++ files to Patchy's WASM target and construct
`WebBridgeWasm` after `MainWindow` initialization:

```sh
cp poc/patchy-bridge/patchy/web_bridge_wasm.* vendor/Patchy/src/ui/
cd vendor/Patchy
git apply --check ../../poc/patchy-bridge/patchy/integration.patch
git apply ../../poc/patchy-bridge/patchy/integration.patch
```

Do not treat a successful patch application as a build or E2E pass.

