# M0 可行性报告：PSD Normalize Studio Web × Patchy

日期：2026-10-20（Asia/Shanghai）  
结论：**M0 仍未通过；Photoshop 门禁未解除。**  
开发顺序：用户已于 2026-10-20 决定先完成 Web 应用/界面到可用状态，再回头完成
Photoshop 相关验证。该决定只调整开发顺序，不改变 M0 的未通过结论，也不把浏览器
证据当作 Photoshop 兼容性证明。

本轮补完了 macOS 上的真实 WASM 构建、C++ 桥接编译接线，并分别用一份
上游 Patchy 测试套件中 `photoshop-*` 命名的 29 层真实 PSD 和一份 130 层
合成压力样本完成浏览器内打开/重命名/保存副本/关闭重开/图层校验，以及
before/after PNG 的独立像素比较。**只剩 Photoshop 无警告打开这一项 P0
未验证**，因此 M0 仍未通过。

> **M1 进展（2026-10-20）**：负责人授权的 Web 工作台初版已在 `apps/web` 完成，
> 详见 [PROGRESS.md](PROGRESS.md)。该工作不使用 Photoshop 证据，也未改变本报告的
> M0 结论、`artifacts/m0/status.json` 或门禁语义。

## 1. 固定源码与审计范围

- 上游：`https://github.com/SethRobinson/Patchy`
- 本地：`vendor/Patchy`
- 固定提交：`d1ff95235e00af296868d4253e03391ca002ee9d`
- 状态：HEAD 已由 `git rev-parse HEAD` 核对为上述固定 SHA；完整源码树来自该
  提交的 codeload tarball，覆盖在原有 partial clone 工作树上。此前 sparse
  checkout 只含审计文件，本轮的完整树已成功配置并构建。
- 说明：工作树包含本轮新增桥接文件，因此不再是“未修改的上游树”；上游文件
  的修改范围见 `poc/patchy-bridge/patchy/integration.patch`。

已完整阅读要求中的：

- `vendor/Patchy/AGENTS.md`
- `vendor/Patchy/docs/wasm.md`
- `vendor/Patchy/scripts/bundled/scripting-guide.md`
- `vendor/Patchy/scripts/bundled/patchy.d.ts`
- `vendor/Patchy/LICENSE`
- `vendor/Patchy/docs/ps-compat.md`

另外核验了 `NOTICE-THIRD-PARTY.md`、`third_party/ai-models/MODEL-LICENSES.txt`、WASM setup/release 脚本、CMake preset，以及相关 UI/core 源码。

复现固定版本：

```sh
git -c http.version=HTTP/1.1 clone --filter=blob:none \
  https://github.com/SethRobinson/Patchy.git vendor/Patchy
cd vendor/Patchy
git switch --detach d1ff95235e00af296868d4253e03391ca002ee9d
git rev-parse HEAD
```

## 2. 真实 API 入口：已存在与需要新增

### 已存在于固定提交

| 能力 | 真实入口 | 证据/约束 |
|---|---|---|
| WASM 浏览器构建 | `CMakePresets.json` 的 `wasm-core`、`wasm-release`、`wasm-release-st`；`scripts/release/build-wasm.bat` | 全应用为 Qt 6.10.3 wasm_multithread + Emscripten 4.0.7；线程版部署必须 COOP/COEP。 |
| 浏览器文件进入 MEMFS | `src/ui/dialog_utils_wasm.cpp/.hpp` | `__patchyStageBrowserFile` 写 `/opened/<n>`；drop 写纯 JS 队列，C++ `QTimer` 每 250 ms 拉取。 |
| 浏览器下载 | `patchy::ui::wasm_files::download_file_in_browser`；保存调用链中的 `offer_browser_download_for_saved_file` | 已写文件重新读取成 `Uint8Array`/`Blob`，再点击 `<a download>`。 |
| 递归图层 JSON | `src/ui/script_automation.cpp::layer_state` 与 `ScriptEngineHost::automation_state` | 返回文档、递归 `layers/children`、id、name、bounds、visible、locked、opacity、blendMode、类型标记等。 |
| 图层遍历 | 内置脚本 `doc.layers`、组 `layer.children`；C++ `Document::layers()` | `patchy.d.ts` 明确顶层层序与子层入口。 |
| 图层按 ID 查找 | 内置脚本 `doc.getLayer(id)`；C++ `Document::find_layer` | ID 是十进制字符串，只在文档打开期间有效；重开后必须重新查询。 |
| 图层重命名 | 内置脚本可写 `layer.name`；`ScriptLayerObject::set_name` → `Layer::set_name` | 写入前进入 Patchy mutation/undo 路径，之后发结构变更通知。 |
| 打开文档 | 内置脚本 `app.open(path)`；`ScriptEngineHost::open_document_file` | Web 输入必须先成为 MEMFS 路径。 |
| 保存副本/导出 | 内置脚本 `doc.saveAs(path)` / `doc.exportAs(path)`；`ScriptEngineHost::save_session_to_path` | `saveAs` 会重定向当前文档；`exportAs` 保留原路径/modified 状态。 |
| PNG 预览 | `doc.renderPreview(path, options?)`；`ScriptEngineHost::render_preview` | 不改变文档路径、modified 状态或历史。 |
| JS 脚本执行 | `ScriptEngineHost::run_source` / `run_file`，完成通过 `run_state_changed`，结果由 `last_result()` 读取 | `patchy.setResult` 仅返回可 JSON 序列化的小结果。 |
| CLI/headless | `patchy --headless --run-script ... --script-output ...` | 是桌面过渡验证入口，不等于 Web 交付。 |

### 当前不存在、M0 桥接必须新增

源码搜索没有发现可供外部 DOM/Vue 调用的 `getDocumentInfo/listLayers/renameLayer/saveAsPsd` RPC，也没有 `EMSCRIPTEN_KEEPALIVE` 业务导出、`postMessage` 业务协议或现成的 request/response 队列。

需要新增：

本轮 PoC 已新增页面 request/response 队列、协议版本、结构化错误、文档
revision/fingerprint 前置条件、AbortSignal/timeout 取消状态、Patchy `QTimer`
轮询、单请求互斥和白名单操作。仍需要新增或验证：

1. 页面刷新/完整 tab 崩溃后的持久恢复。
2. 大文件分块或流式响应策略；现 PoC 只返回小 JSON。
3. 批量重命名的事务/回滚语义。
4. 编译后的永久 API/version 约定与真实浏览器验证。

`poc/patchy-bridge/patchy/web_bridge_wasm.*` 只调用上述已确认入口，不把 Vue 代码放进 Patchy 内置脚本上下文，也不开放任意脚本执行。

## 3. macOS WASM 构建与测试结果

主机是 Apple Silicon macOS 27.0.1。官方 `setup-emsdk.ps1`、`setup-qt-wasm.ps1`
和 `build-wasm.bat` 仍绑定 Windows；本轮没有修改上游脚本，而是用等价的
macOS host kit 配置复现了构建。工具链：

| 工具 | 实际使用 |
|---|---|
| CMake / Ninja | `.tools/venv` 中的 Python wheel 安装 |
| Emscripten | `.deps/emsdk` 4.0.7；emulator 使用其自带 Node 24.19.0 |
| Qt | `.deps/Qt/6.10.3`：`macos` host kit + `wasm_multithread` target kit |
| Node / Playwright | Node 26.11.1；`@playwright/test` 1.64.1 |

一次性工具链准备（本轮使用的等价命令；受限网络需要给下载步骤配置 HTTPS
代理）：

```sh
python3 -m venv .tools/venv
.tools/venv/bin/pip install cmake ninja aqtinstall
git clone https://github.com/emscripten-core/emsdk.git vendor/Patchy/.deps/emsdk
vendor/Patchy/.deps/emsdk/emsdk install 4.0.7
vendor/Patchy/.deps/emsdk/emsdk activate 4.0.7
.tools/venv/bin/aqt install-qt mac desktop 6.10.3 clang_64 \
  --outputdir vendor/Patchy/.deps/Qt
.tools/venv/bin/aqt install-qt mac wasm 6.10.3 wasm_multithread \
  --outputdir vendor/Patchy/.deps/Qt
```

`wasm-core` 使用 Emscripten toolchain 构建并执行 CTest：

```sh
cmake -S vendor/Patchy -B vendor/Patchy/build/wasm-core -G Ninja \
  -DCMAKE_BUILD_TYPE=Release -DPATCHY_BUILD_APP=OFF -DPATCHY_BUILD_TESTS=ON \
  -DCMAKE_TOOLCHAIN_FILE=vendor/Patchy/.deps/emsdk/upstream/emscripten/cmake/Modules/Platform/Emscripten.cmake \
  -DCMAKE_CROSSCOMPILING_EMULATOR=vendor/Patchy/.deps/emsdk/node/24.19.0_64bit/bin/node \
  -DCMAKE_CXX_FLAGS="-pthread -fwasm-exceptions" # 其余链接参数见 ci/macos-wasm-m0.sh
cmake --build vendor/Patchy/build/wasm-core
ctest --test-dir vendor/Patchy/build/wasm-core --output-on-failure
```

结果：CTest 1/1 通过；测试程序执行 **1299** 项，**1192 通过、0 失败、107
跳过**，耗时 20.6 s。跳过项均因可选的真实样本目录不存在，不是失败。

`wasm-release` 使用 Qt macOS host kit 与 `wasm_multithread` target kit 构建：

```sh
cmake -S vendor/Patchy -B vendor/Patchy/build/wasm-release -G Ninja \
  -DCMAKE_BUILD_TYPE=Release -DPATCHY_BUILD_APP=ON -DPATCHY_BUILD_TESTS=OFF \
  -DCMAKE_TOOLCHAIN_FILE=vendor/Patchy/.deps/Qt/6.10.3/wasm_multithread/lib/cmake/Qt6/qt.toolchain.cmake \
  -DQT_HOST_PATH=vendor/Patchy/.deps/Qt/6.10.3/macos \
  -DQT_CHAINLOAD_TOOLCHAIN_FILE=vendor/Patchy/.deps/emsdk/upstream/emscripten/cmake/Modules/Platform/Emscripten.cmake
cmake --build vendor/Patchy/build/wasm-release
```

结果：生成 `patchy.wasm`（84 MB）和 `patchy.data`（74 MB）；桥接
`web_bridge_wasm.cpp` 作为 `patchy_ui` 的真实源文件编译并链接。构建日志中
只有 2 条上游既有警告（AVIF 未使用函数、coalesced pointer 未使用字段），
桥接文件无警告。完整命令与日志路径见 `ci/macos-wasm-m0.sh` 和
`artifacts/m0/logs/macos-wasm-*.txt`。

`scripts/wasm/serve.mjs` 在本地提供 COOP/COEP 头；`stage-dev-site.mjs` 把
`patchy-bridge.js`/`m0-harness.js` 复制进构建目录，并只在 `?m0=1` 时启用
验收入口。

## 4. 最小桥接 PoC

代码路径：

- `poc/patchy-bridge/web/patchy-bridge.js`：纯 JS 请求/响应队列。
- `poc/patchy-bridge/web/M0BridgeProbe.vue`：最小 Vue 3 调用链。
- `poc/patchy-bridge/patchy/web_bridge_wasm.hpp/.cpp`：Patchy 侧 `QTimer` 轮询与白名单操作草案。
- `poc/patchy-bridge/patchy/integration.patch`：针对固定提交的 CMake/MainWindow 精确接线。
- `poc/patchy-bridge/PROTOCOL.md`：协议 v2、白名单、前置条件、撤销与预览像素对比、稳定错误码。
- `poc/patchy-bridge/tests/*.test.mjs`：队列、取消、多客户端、协议和静态接线门禁。
- `poc/patchy-bridge/web/m0-harness.js`：仅在 `?m0=1` 启用的浏览器验收入口。
- `poc/patchy-bridge/tests/e2e/m0-roundtrip.spec.mjs`：真实下载、保存重开、原件哈希和 PNG RGBA 像素比较。
- `ci/windows-wasm-m0.ps1`：完整 Windows build + Playwright 执行器。
- `ci/photoshop-m0-check.ps1`：调用 Patchy 官方检查器的警告可见 Photoshop 门禁。

Vue 示例表达的完整预期顺序是：

```text
浏览器 File
  → Patchy 现有 __patchyStageBrowserFile 写 /opened
  → JS 只把 openDocument JSON 放入队列
  → Qt QTimer 拉取并运行 app.open
  → automation_state 返回递归图层 JSON
  → renderPreview(/saved/m0-before.png)
  → layer.name = 新名称
  → saveAs(/saved/m0-normalized.psd)
  → 关闭已保存会话并 app.open 保存副本
  → 重新读取新会话图层，按新名称校验
  → renderPreview(/saved/m0-after.png)
```

输出路径强制位于 `/saved/`，不会覆盖原 PSD。重开后不复用旧 layer ID。

### Asyncify / Qt 事件循环约束

页面的 `request()` 和文件 staging 的 Promise continuation 只修改普通 JS 数组，从不调用 `Module.ccall/cwrap` 或其他 WASM export。Patchy 侧只能由 Qt `QTimer` 在已恢复的 Qt 主循环中进入操作。该形状与 `docs/wasm.md` 现有 drop/picker 实现一致，规避 raw JS → WASM → nested event loop 对单槽 Asyncify 状态的破坏。

### 已运行验证

```sh
cd poc/patchy-bridge
npm test
node --check web/patchy-bridge.js
node --check tests/bridge-queue.test.mjs
```

结果：12/12 JS/静态协议测试通过；`integration.patch` 已应用到固定 Patchy
commit，桥接 C++ 编译进真实 WASM UI target。

M0 的**真实 PSD** 往返使用上游 Patchy 测试套件中的
`vendor/Patchy/test-fixtures/psd/photoshop-clip-base-effects.psd`（360×100，
29 个像素层，其中 14 个带 clipping 关系）。该目录不随应用分发，只作为测试
输入：

```sh
PATCHY_ROOT=vendor/Patchy \
PATCHY_WASM_SITE=vendor/Patchy/build/wasm-release \
M0_PSD_FIXTURE=vendor/Patchy/test-fixtures/psd/photoshop-clip-base-effects.psd \
M0_ARTIFACT_DIR=artifacts/m0/browser-20261020-05 \
M0_PATCHY_COMMIT=d1ff95235e00af296868d4253e03391ca002ee9d \
npm run test:e2e
```

结果（2026-10-20 19:11，4.0 s，1 passed）：

- 源 PSD SHA-256 前后不变：
  `ac492156547a772ba120f1d3a0d1b0164836d719100eb51e54c2a3c8f12ae66a`。
- 输出 PSD SHA-256：
  `cf6cb55011599824370e159ab6c7e81f24666551155b2d963b1576215ea84f5a`。
- 文档 ID 从 `1` 变为 `2`，`Background` 改为 `Background [M0]`，重开后在新
  文档 ID 下重新查询到该层。
- before/after PNG 均为 360×100，独立 Chromium 解码后的 **RGBA SHA-256 均为**
  `b22584a6cfae011f3875ebeb4c126126550f10c668bcc2aeb86995d450fd18c4`。
- 独立 Python `psd_tools` 解析输出：29 层、14 个 clipping 关系保留、
  `Background [M0]` 存在，层序与源文件一致。
- 恰好 3 次浏览器下载；console 无 `error`/`pageerror`。
- 证据：`artifacts/m0/browser-20261020-05/`，含 manifest、三份下载、重开
  截图、console、trace 和 `browser-evidence-verification.json`。
- 同一 fixture 在 `browser-20261020-03`、`-05`、`-06` 三次运行产出相同的
  源/输出哈希和 RGBA 哈希；`-06` 是 CI 脚本完整复现后的最新证据。

同一轮 E2E 还在真实 WASM 中验证了 8 项桥接边界，全部通过：

| 检查 | 操作 | 期望错误 |
|---|---|---|
| 缺失前置条件 | `renameLayer` | `PRECONDITION_REQUIRED` |
| 过期 revision/fingerprint | `renameLayer` | `STALE_DOCUMENT` |
| 越界输出路径 | `renderPreview` | `INVALID_REQUEST` |
| 非 staging 输入路径 | `openDocument` | `INVALID_REQUEST` |
| 未知操作/任意脚本 | `executeScript` | `INVALID_REQUEST` |
| 覆盖已有 preview | `renderPreview` | `SCRIPT_ERROR` |
| 覆盖已有 PSD | `saveAsAndReopen` | `SCRIPT_ERROR` |
| 拒绝请求未改变状态 | `getState` | 指纹与层名不变 |

期间发现并修复了一个桥接缺陷：`run_source()` 在脚本抛错时也返回 `false`，
桥接原先把它和“引擎忙”混为一谈，导致预期 `SCRIPT_ERROR` 被误报为 `BUSY`。
现在改为启动前单独检查 `run_active()`，脚本错误统一经完成回调返回
`SCRIPT_ERROR`；修复后重跑得到上述结果。该错误分类此前只被单元测试覆盖，
真实 WASM 断言暴露了差异。

随后用 `ci/macos-wasm-m0.sh` 从相对路径完整复现（脚本自身作为被测对象）：
CTest 1/1、20.63 s；E2E 4.0 s、1 passed；独立 verifier 通过。证据在
`artifacts/m0/browser-20261020-06/`，构建/测试日志在
`artifacts/m0/logs/macos-20261020-191428/`。首次复现暴露了两个脚本缺陷，
均已修复：相对路径被写进构建目录后失效（现在所有输入和产物路径先转为绝对
路径），以及 Qt WASM toolchain 需要 `EMSDK`/`EM_CONFIG` 环境变量（现在脚本
显式导出并检查 `.emscripten`）。

130 层合成压力样本 `tests/fixtures/m0-synthetic-125-layers.psd`（1024×768，
5 组、130 个非根图层）使用同一套 E2E，只把 `M0_PSD_FIXTURE` 指向该文件、
`M0_ARTIFACT_DIR` 指向 `artifacts/m0/browser-20261020-02`，其余环境变量不变。

结果（25.0 s，1 passed）：源 SHA-256
`79ef4bf26b432d6f66a88c637c2e369409ed12a0e453b50fd337de86acc8305c`
不变；输出 PSD SHA-256
`396473e3618c58dfafe82826705319efef415cb120c3b9994fe4e7bd2c9b0f72`；
文档 ID `1 → 2`，`section_01` 改为 `section_01 [M0]`；before/after 均为
1024×768，RGBA SHA-256 均为
`e07486f069dd4192703bce127dd24798a53d15fd81377d782de5cf028900eeac`；
`psd_tools` 解析到 130 个非根图层、5 组，重命名层存在。证据在
`artifacts/m0/browser-20261020-02/`。该样本覆盖图层数量，但不代表真实设计
文件的复杂效果。

`saveAsAndReopen` 最初会额外下载一次 PSD（浏览器共 4 次下载）。排查确认
Patchy 保存协调器已经通过 `offer_browser_download_for_saved_file` 提供下载；
桥接重复调用是缺陷，已移除桥接侧第二次下载。重跑后恰好 3 次下载。

### 未运行验证

- **没有用 Photoshop 打开输出。** 本机未安装 Photoshop，因此没有执行
  “警告可见、无 repair/unknown-data/discard-data”检查；Patchy 自己保存/重开
  成功不能替代该检查。
- **没有 100+ 图层的获批真实设计 PSD/PSB。** 29 层真实 Photoshop 测试样本
  覆盖了真实文件路径，130 层合成样本覆盖了图层数量，但两者都不等于 M1 所需
  的复杂设计文件（蒙版、智能对象、调整层、文字等组合）。
- 没有在 Windows 上运行官方 `build-wasm.bat` 构建 lane。
- Vue SFC 没有进入完整 Vue 工程构建；M0 刻意不搭建整套应用。
- tab 崩溃恢复、大响应分块和批量重命名仍未实现/验证。

合成 fixture 的证据目录是 `artifacts/m0/browser-20261020-02/`；更早的
`browser-20261020-01/` 是下载计数断言失败后被取代的中间运行，
`browser-20261020-04/` 是协议检查暴露 `BUSY` 误分类的失败运行，二者均不构成
通过证据。`artifacts/m0/screenshots/README.md` 仍只放状态说明，不放伪造占位图。

## 5. CI 可行路径

macOS 复现脚本：

```sh
ci/macos-wasm-m0.sh \
  /path/to/Patchy /path/to/LayerForgeAI \
  tests/fixtures/m0-synthetic-125-layers.psd \
  /evidence/m0-20261020-001
```

脚本核对固定 SHA、复制桥接文件、按上面参数配置并构建 `wasm-core` 与
`wasm-release`、运行 CTest、staging harness、执行 Playwright E2E，最后由
独立 verifier 写 `browser-evidence-verification.json`。它只证明浏览器链路，
不会把 M0 标为通过。

该脚本已于 2026-10-20 19:14–19:16 在固定 SHA 上端到端执行一次：自动使用
`.tools/venv` 的 CMake/Ninja、`wasm-core` CTest 1/1（20.63 s）、
`wasm-release` 构建、E2E 1 passed（4.0 s）、独立 verifier `ok:true`，
并写出 `photoshopVerified:false`、`m0Accepted:false`。该次运行的 E2E 使用
29 层真实 PSD，脚本同时接受合成样本作为构建/浏览器冒烟输入。

Windows 仍提供 `ci/windows-wasm-m0.ps1`，但本轮未在 Windows 执行。推荐使用
专用、自托管 Windows x64 runner，因为它可以固定 Patchy 文档要求的 Visual
Studio 18、Qt 6.10.3、磁盘缓存和 Photoshop 2026。

流水线应依次：

1. 完整 checkout Patchy 固定 SHA，并核对 `git rev-parse HEAD`。
2. 复制/应用 `web_bridge_wasm.*` 并接入 WASM target/MainWindow 生命周期。
3. 运行官方 `setup-emsdk.ps1`、`setup-qt-wasm.ps1` 和 `build-wasm.bat`。
4. 运行 `wasm-core` 测试；桥接代码要求零警告。当前 macOS 构建仍有 2 条上游
   既有警告，需在最终门禁前确认是否接受或修复。
5. 用 `scripts/wasm/serve.mjs` 提供 COOP/COEP，同源加载浏览器入口与 Patchy。
6. Playwright 使用真实 PSD 执行完整链路；M0 已用 29 层 Photoshop 测试样本，
   M1 需再准备 100+ 图层的获批设计样本。保存浏览器 console、trace、截图、
   输出 PSD/PNG 与 SHA-256。
7. 断言重开后的层名存在；before/after 纯重命名像素必须逐像素一致。
8. 在可见警告模式下由 Photoshop 打开输出；任何 repair、unknown-data、discard-data 提示均失败。

GitHub-hosted runner 只有在其已安装工具版本与固定文档完全匹配时才可替代自托管 runner；不能假设未来镜像恰好含 Visual Studio 18。

## 6. 许可证核验

- Patchy 主许可证：MIT。
- Qt 6：商业许可证或适用的开源许可证；Patchy notice 记录 wasm 使用 LGPL Qt 及随包 SPDX/许可证要求。
- web-only libheif：LGPL-3.0-or-later，分发必须保留许可证、源码/修改和可重链接义务。
- ONNX Runtime Web：MIT。
- MobileSAM、Segment Anything、EfficientViT-SAM：Apache-2.0；MobileSAM ONNX export 与 BiRefNet 条目含 MIT。量化/修改说明必须保留。
- Web fonts：SIL OFL-1.1。
- 编解码与工具还包含 MIT、BSD-2/3-Clause、zlib、专利许可等；完整清单以 `NOTICE-THIRD-PARTY.md` 为准，发布包必须带对应 notice/license。
- 浏览器 E2E 新增唯一 npm 开发依赖 `@playwright/test` 1.64.1，锁文件同时固定
  `playwright`/`playwright-core` 1.64.1；三者均标记 Apache-2.0。Chromium
  浏览器及其 notices 由 Playwright 安装器管理，CI 归档时仍需保留对应许可材料。
  Vue 文件只是宿主调用示例，未安装、复制或打包 Vue。没有新增模型。

桥接还实施了三项写入保护：请求 JSON 上限为 64 KiB；打开路径必须匹配
Patchy `/opened/<number>/<filename>`，输出只能是 `/saved/` 的直接子文件。
preview 与 PSD 保存前均调用 `patchy.io.fileExists`，若目标已存在则拒绝覆盖。
最终 `verify:evidence` 会重新计算源文件/输出文件 SHA-256，在独立 Chromium
实例中重新解码 PNG 并计算 RGBA SHA-256，复核 8 项协议边界检查，并要求
Photoshop 日志恰好包含一条 `CLEAN`，通过后才生成 `evidence-verification.json`。
对 `browser-20261020-05` 做过负向检查：缺少 `photoshop-open-check.log` 时
verifier 以 `M0 evidence invalid: photoshop-open-check.log is missing or empty`
拒绝，且不生成 `evidence-verification.json`。

许可证允许性不是本轮的产品法律意见。进入发布工程前应建立 SBOM，并逐项验证二进制分发、源码提供、NOTICE、专利和模型修改标注。

## 7. 阻塞列表与 M0 通过条件

| 优先级 | 阻塞 | 状态与解除条件 |
|---|---|---|
| P0 | 无固定 WASM 构建环境 | **macOS 已解除**：固定 SHA 上完成 `wasm-core` + `wasm-release`，日志与产物哈希已归档。Windows 官方 lane 尚未运行，见 P1。 |
| P0 | C++ bridge 未编译/未接线 | **已解除**：桥接编译进真实 `patchy_ui`，浏览器 request/response 与单层往返通过；桥接代码零警告。 |
| P0 | 协议边界未在真实 WASM 验证 | **已解除**：真实浏览器中 8 项路径、前置条件、只读与覆盖保护断言全部通过，拒绝请求后指纹不变。 |
| P0 | 真实 PSD 往返 | **已解除**：29 层 Photoshop 测试 PSD 完成重命名、另存、关闭重开、层名校验和 PNG 像素一致；130 层合成样本另做数量压力验证。 |
| P0 | Photoshop 无警告打开未验证 | **未解除**：本机未安装 Photoshop，尚未以警告可见方式打开输出。 |
| P0 | before/after PNG 未产生/比较 | **已解除**：真实 PSD 与合成样本的两张渲染 PNG 均已归档，独立解码 RGBA SHA-256 完全一致。 |
| P1 | Windows 官方构建 lane 未运行 | 在 Windows 自托管 runner 上执行官方脚本，确认与 macOS 结果一致，并处理 2 条上游警告。 |
| P1 | 100+ 图层获批真实设计样本未提供（M1 输入） | 提供样本并完成 100+ 图层浏览/选择稳定性验收；这超出当前 29 层真实 PSD 证据。 |
| P1 | tab 崩溃恢复与大响应传输未实现 | 设计持久 checkpoint；覆盖 reload/crash；大 JSON/图片不经响应队列整包复制。 |
| P1 | 大文件/内存未验证 | 用尺寸与图层数分档样本测内存峰值、耗时和失败提示。 |
| P1 | 完整第三方发布包未审计 | 生成 SBOM，核对实际 stage 内容与 license/NOTICE 一致。 |

剩余 M0 P0 只有 Photoshop 无警告打开。只有该项解除、证据归档后，M0 才能从
“未通过”改为“通过”。100+ 图层获批真实设计样本仍是 M1 自身的验收前提。

## 8. 下一阶段（开发顺序已由用户调整）

2026-10-20 用户明确要求：**先把界面和整体应用开发到可用，再对接 Photoshop
相关验证**。因此后续工作按以下顺序执行，但 M0 的结论与门禁语义保持不变：

1. ~~先构建 Vue 3 + TypeScript + Vite 工作台~~ **初版已完成**（`apps/web`）：
   项目列表、PSD 导入、图层树、属性/重命名、命名计划、保存重开、历史与 IR
   草稿；Patchy iframe 传输层已实现，但尚未用真实 Patchy 构建回归，双向选中
   仍待 `selectLayer`。详见 [PROGRESS.md](PROGRESS.md)。
2. 在上述 UI 工作流可运行后，再回到 M0 剩余项：在装有 Photoshop 2026 的
   交互式主机上，用 `ci/photoshop-m0-check.ps1` 以警告可见方式打开
   `artifacts/m0/browser-20261020-06/m0-normalized.psd`；任何 repair、
   unknown-data、discard-data 提示均失败，且不自动关闭对话框。
3. 准备 M1 所需的 100+ 图层获批真实设计 PSD/PSB；先用新证据目录重跑
   `ci/macos-wasm-m0.sh`，确认 100+ 图层下仍通过相同像素/重开门禁。
4. 跑 Windows 官方构建 lane，与 macOS 构建/测试结果对照；确认是否接受上游
   2 条既有警告。
5. 通过完整 `verify:evidence`（它要求 Photoshop 日志恰好一条 `CLEAN`）后，
   才更新 `docs/M0_FEASIBILITY.md` 与 `artifacts/m0/status.json` 为通过。
6. tab 崩溃恢复、大响应传输和批量重命名在 UI 与 M0 完成后继续推进；FastAPI
   与 AI 语义命名按技术方案 V1.0 的 M2/M3 阶段实施。

> 本文件第 3.2 节、M0 定义与技术方案 V1.0 中“未通过 M0 不进入 M1”的原始
> 门禁仍然有效；上表是用户授权的顺序覆盖，不代表 M0 已通过。UI 工作产出的
> 功能不得被描述为已通过 Photoshop 兼容性验证。

