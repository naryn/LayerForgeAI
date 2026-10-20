#!/bin/bash
# macOS reproduction of the M0 WASM build + browser round trip.
# This does NOT satisfy the Photoshop gate. The 100+ layer approved design
# sample is an M1 input and cannot be replaced by a synthetic fixture.
set -euo pipefail

if [ "$#" -ne 4 ]; then
  echo "usage: $0 <PatchyRoot> <StudioRoot> <Fixture.psd> <new ArtifactDir>" >&2
  exit 2
fi

PATCHY_ROOT=$1
STUDIO_ROOT=$2
FIXTURE=$3
ARTIFACT_DIR=$4
EXPECTED_COMMIT=d1ff95235e00af296868d4253e03391ca002ee9d

[ -d "$PATCHY_ROOT" ] || { echo "PatchyRoot does not exist: $PATCHY_ROOT" >&2; exit 2; }
[ -d "$STUDIO_ROOT" ] || { echo "StudioRoot does not exist: $STUDIO_ROOT" >&2; exit 2; }
[ -f "$FIXTURE" ] || { echo "Fixture does not exist: $FIXTURE" >&2; exit 2; }
case "$(printf '%s' "$FIXTURE" | tr 'A-Z' 'a-z')" in
  *.psd|*.psb) ;;
  *) echo "Fixture must be a PSD or PSB: $FIXTURE" >&2; exit 2 ;;
esac
# CMake emits relative -I/--pre-js paths into a build directory that is not
# the caller's cwd, so every input path must be absolute.
PATCHY_ROOT=$(cd "$PATCHY_ROOT" && pwd -P)
STUDIO_ROOT=$(cd "$STUDIO_ROOT" && pwd -P)
FIXTURE=$(cd "$(dirname "$FIXTURE")" && pwd -P)/$(basename "$FIXTURE")
case "$ARTIFACT_DIR" in /*) ;; *) ARTIFACT_DIR="$PWD/$ARTIFACT_DIR" ;; esac
LOG_DIR=${M0_LOG_DIR:-"$STUDIO_ROOT/artifacts/m0/logs/macos-$(date +%Y%m%d-%H%M%S)"}
case "$LOG_DIR" in /*) ;; *) LOG_DIR="$PWD/$LOG_DIR" ;; esac
[ ! -e "$ARTIFACT_DIR" ] || {
  echo "ArtifactDir must be new so evidence cannot overwrite an earlier run: $ARTIFACT_DIR" >&2
  exit 2
}

TOOLS_BIN="$STUDIO_ROOT/.tools/venv/bin"
if [ -x "$TOOLS_BIN/cmake" ] && [ -x "$TOOLS_BIN/ninja" ]; then
  CMAKE=${CMAKE:-"$TOOLS_BIN/cmake"}
  NINJA=${NINJA:-"$TOOLS_BIN/ninja"}
  PATH="$TOOLS_BIN:$PATH"
  export PATH
else
  CMAKE=${CMAKE:-cmake}
  NINJA=${NINJA:-ninja}
fi
NODE=${NODE:-node}
QT_ROOT=${QT_ROOT:-"$PATCHY_ROOT/.deps/Qt/6.10.3"}
EMSDK=${EMSDK:-"$PATCHY_ROOT/.deps/emsdk"}
case "$QT_ROOT" in /*) ;; *) QT_ROOT="$PWD/$QT_ROOT" ;; esac
case "$EMSDK" in /*) ;; *) EMSDK="$PWD/$EMSDK" ;; esac
export EMSDK
export EM_CONFIG="$EMSDK/.emscripten"
[ -f "$EM_CONFIG" ] || { echo "emsdk config missing: $EM_CONFIG" >&2; exit 2; }
mkdir -p "$LOG_DIR"

actual_commit=$(git -C "$PATCHY_ROOT" rev-parse HEAD)
[ "$actual_commit" = "$EXPECTED_COMMIT" ] || {
  echo "Expected Patchy $EXPECTED_COMMIT, got $actual_commit" >&2
  exit 2
}

bridge_root="$STUDIO_ROOT/poc/patchy-bridge"
cp "$bridge_root/patchy/web_bridge_wasm.hpp" "$PATCHY_ROOT/src/ui/web_bridge_wasm.hpp"
cp "$bridge_root/patchy/web_bridge_wasm.cpp" "$PATCHY_ROOT/src/ui/web_bridge_wasm.cpp"
mkdir -p "$PATCHY_ROOT/scripts/wasm/m0"
cp "$bridge_root/web/patchy-bridge.js" "$PATCHY_ROOT/scripts/wasm/m0/patchy-bridge.js"
cp "$bridge_root/web/m0-harness.js" "$PATCHY_ROOT/scripts/wasm/m0/m0-harness.js"
if ! grep -q "src/ui/web_bridge_wasm.cpp" "$PATCHY_ROOT/CMakeLists.txt"; then
  git -C "$PATCHY_ROOT" apply "$bridge_root/patchy/integration.patch"
fi

emulator="$EMSDK/node/24.19.0_64bit/bin/node"
[ -x "$emulator" ] || { echo "Emscripten Node not found: $emulator" >&2; exit 2; }

"$CMAKE" -S "$PATCHY_ROOT" -B "$PATCHY_ROOT/build/wasm-core" -G Ninja \
  -DCMAKE_MAKE_PROGRAM="$NINJA" \
  -DCMAKE_BUILD_TYPE=Release \
  -DPATCHY_BUILD_APP=OFF -DPATCHY_BUILD_TESTS=ON \
  -DCMAKE_TOOLCHAIN_FILE="$EMSDK/upstream/emscripten/cmake/Modules/Platform/Emscripten.cmake" \
  -DCMAKE_CROSSCOMPILING_EMULATOR="$emulator" \
  -DCMAKE_C_FLAGS="-pthread -fwasm-exceptions" \
  -DCMAKE_CXX_FLAGS="-pthread -fwasm-exceptions" \
  -DCMAKE_EXE_LINKER_FLAGS="-pthread -fwasm-exceptions -Wno-pthreads-mem-growth -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=256MB -sMAXIMUM_MEMORY=4GB -sSTACK_SIZE=8MB -sDEFAULT_PTHREAD_STACK_SIZE=1MB -sPTHREAD_POOL_SIZE=32 -sPTHREAD_POOL_SIZE_STRICT=2 -sNODERAWFS=1 -sENVIRONMENT=node,worker -sEXIT_RUNTIME=1 --pre-js=$PATCHY_ROOT/scripts/wasm/node-env-pre.js" \
  2>&1 | tee "$LOG_DIR/wasm-core-configure.txt"
"$CMAKE" --build "$PATCHY_ROOT/build/wasm-core" --parallel "$(sysctl -n hw.ncpu)" \
  2>&1 | tee "$LOG_DIR/wasm-core-build.txt"
ctest --test-dir "$PATCHY_ROOT/build/wasm-core" --output-on-failure \
  2>&1 | tee "$LOG_DIR/wasm-core-tests.txt"

"$CMAKE" -S "$PATCHY_ROOT" -B "$PATCHY_ROOT/build/wasm-release" -G Ninja \
  -DCMAKE_MAKE_PROGRAM="$NINJA" \
  -DCMAKE_BUILD_TYPE=Release \
  -DPATCHY_BUILD_APP=ON -DPATCHY_BUILD_TESTS=OFF \
  -DCMAKE_TOOLCHAIN_FILE="$QT_ROOT/wasm_multithread/lib/cmake/Qt6/qt.toolchain.cmake" \
  -DQT_HOST_PATH="$QT_ROOT/macos" \
  -DQT_CHAINLOAD_TOOLCHAIN_FILE="$EMSDK/upstream/emscripten/cmake/Modules/Platform/Emscripten.cmake" \
  -DCMAKE_C_FLAGS="-fexceptions -pthread -msimd128" \
  -DCMAKE_CXX_FLAGS="-fexceptions -pthread -msimd128" \
  2>&1 | tee "$LOG_DIR/wasm-release-configure.txt"
"$CMAKE" --build "$PATCHY_ROOT/build/wasm-release" --parallel "$(sysctl -n hw.ncpu)" \
  2>&1 | tee "$LOG_DIR/wasm-release-build.txt"

"$NODE" "$bridge_root/scripts/stage-dev-site.mjs" "$PATCHY_ROOT/build/wasm-release"

cd "$bridge_root"
npm ci
npx playwright install chromium
PATCHY_ROOT="$PATCHY_ROOT" \
PATCHY_WASM_SITE="$PATCHY_ROOT/build/wasm-release" \
M0_PSD_FIXTURE="$FIXTURE" \
M0_ARTIFACT_DIR="$ARTIFACT_DIR" \
M0_PATCHY_COMMIT="$actual_commit" \
  npm run test:e2e 2>&1 | tee "$LOG_DIR/e2e.txt"

M0_ARTIFACT_DIR="$ARTIFACT_DIR" npm run verify:browser-evidence \
  2>&1 | tee "$LOG_DIR/browser-evidence-verification.txt"

echo "Browser evidence: $ARTIFACT_DIR"
echo "Build/test logs: $LOG_DIR"
echo "M0 is NOT passed: Photoshop warning-free open remains unverified."
echo "m1Allowed stays false until the Photoshop gate and full evidence verifier pass."
