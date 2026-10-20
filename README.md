# LayerForgeAI

**PSD Normalize Studio Web**：基于 [Patchy](https://github.com/SethRobinson/Patchy) 的本地优先 PSD 规范化工作台。

目标是在浏览器中打开 PSD、读取真实图层树、审核 AI/人工命名建议、应用批量重命名、另存并重开验证，最终导出 normalized PSD、PNG 资产与 Design IR。Patchy 是 PSD 编辑与渲染引擎；本项目的 AI 只输出计划，执行器只通过白名单桥接操作修改文档。

## 当前状态（2026-10-20）

| 项目 | 状态 |
|---|---|
| Patchy 源码/API/许可证审计 | 完成 |
| 固定提交 `d1ff952` 的 macOS WASM 构建 | 完成 |
| 浏览器 ↔ Patchy 桥接（协议 v1） | 完成并通过真实 PSD 往返 |
| 真实 29 层 PSD / 130 层合成样本回归 | 完成 |
| 真实浏览器协议边界检查（8 项） | 完成 |
| 独立浏览器证据校验 + 完整门禁负向测试 | 完成 |
| macOS 可复现 CI 脚本 | 完成并端到端重跑 |
| Photoshop 2026 无警告打开 | **未验证**（构建机未安装 Photoshop） |
| Windows 官方构建 lane | 未运行 |
| 100+ 图层获批真实设计样本 | 未提供（M1 输入） |
| Vue3 Web UI / FastAPI / AI | **尚未实现**（下一步） |

> **门禁说明**：M0 技术门禁仍因 Photoshop 无警告打开未验证而不通过，仓库中的
> `artifacts/m0/status.json` 保持 `status: blocked`、`m1Allowed: false`，不能对外宣称
> Photoshop 兼容。2026-10-20 项目负责人已明确调整开发顺序：**先完成 Web 界面与整体
> 应用，再对接 Photoshop**。因此 UI/应用开发按负责人指令提前启动，但这不等于 M0 通过。

详细进度见 [docs/PROGRESS.md](docs/PROGRESS.md)，M0 技术报告与阻塞列表见
[docs/M0_FEASIBILITY.md](docs/M0_FEASIBILITY.md)。

## 当前可验证的能力

M0 PoC 位于 [`poc/patchy-bridge`](poc/patchy-bridge/README.md)：

- 浏览器把文件交给 Patchy 现有 `__patchyStageBrowserFile`，写入 MEMFS。
- 页面 JS 只向纯 JS 队列追加请求，Patchy 侧由 Qt `QTimer` 轮询，不从 DOM Promise
  直接进入 WASM。
- 协议 v1 白名单：`getState`、`openDocument`、`renderPreview`、`renameLayer`、
  `saveAsAndReopen`。
- 文档 revision/fingerprint 前置条件、路径白名单、不覆盖已有文件、64 KiB 请求上限、
  单请求互斥、超时与取消。
- 真实 PSD：重命名 → 另存副本 → 关闭重开 → 按新文档 ID 校验层名；before/after PNG
  独立 Chromium 解码后 RGBA SHA-256 完全一致。

## 仓库结构

```text
ci/                     macOS/Windows 构建、浏览器 E2E、Photoshop 兼容性检查
docs/                   M0 可行性报告、进度快照
poc/patchy-bridge/      浏览器桥接 PoC、协议、C++ 适配器、测试与证据脚本
tests/fixtures/         合成 PSD 生成器（大型样例不入库）
artifacts/m0/           状态与轻量证据索引（大型 PSD/PNG/trace 不入库）
vendor/Patchy/          固定提交的第三方源码，不入库
.tools/                 本地工具链虚拟环境，不入库
```

## 复现 M0

### 1. 获取固定 Patchy

```sh
git clone https://github.com/SethRobinson/Patchy.git vendor/Patchy
cd vendor/Patchy
git switch --detach d1ff95235e00af296868d4253e03391ca002ee9d
cd ../..
```

### 2. 准备工具链

已在 macOS 27 / Apple Silicon 验证：Qt 6.10.3（macOS host + `wasm_multithread`
target）、Emscripten 4.0.7、CMake/Ninja（可用 `.tools/venv` 的 Python wheel）、
Node.js 与 Playwright 1.64.1。完整安装命令见
[docs/M0_FEASIBILITY.md](docs/M0_FEASIBILITY.md#3-macos-wasm-构建与测试结果)。

### 3. 构建并跑真实 PSD 往返

```sh
ci/macos-wasm-m0.sh \
  vendor/Patchy "$PWD" \
  vendor/Patchy/test-fixtures/psd/photoshop-clip-base-effects.psd \
  "$PWD/artifacts/m0/browser-$(date +%Y%m%d-%H%M%S)"
```

脚本会核对固定 SHA、复制桥接文件、构建 `wasm-core` 与 `wasm-release`、运行 CTest、
执行 Playwright E2E，并由独立 verifier 校验文件哈希、PNG RGBA 与协议边界。产物目录
必须不存在，避免覆盖历史证据。

浏览器侧单元/静态测试：

```sh
cd poc/patchy-bridge
npm ci
npm test
```

### 4. Photoshop 门禁（后置）

在装有 Photoshop 2026 的交互式 Windows 主机上，将上述最新证据目录复制过去后运行：

```powershell
pwsh -File ci\photoshop-m0-check.ps1 `
  -PatchyRoot C:\work\Patchy `
  -ArtifactDir C:\evidence\m0-<run> `
  -StudioRoot C:\work\LayerForgeAI
```

检查器不会自动关闭警告对话框。只有输出恰好一条 `CLEAN` 且 `verify:evidence`
重新校验全部哈希与 Photoshop 日志通过后，M0 才可标记通过。

## 开发顺序与路线图

按 2026-10-20 的项目决定，当前优先顺序为：

1. **Web UI 与整体应用**：项目列表、PSD 导入、Patchy 画布、图层树、双向选择、
   属性/重命名、审核、保存重开、导出；随后接入 FastAPI + SQLite 项目/版本服务。
2. **Photoshop 对接与兼容性验收**：在可用 Windows 主机上补做无警告打开门禁。
3. **AI 语义命名**：视觉 + 结构分析、JSON 计划、人工审核、批量执行。
4. **编组/安全合并/视觉差异** 与 **Design IR/资产发布**。

在 UI 开发开始前，桥接还需要增加 `selectLayer` 等最小只读/选择操作，以支持图层树与
画布的双向高亮；任何新增操作都必须继续走白名单、前置条件和真实浏览器测试。

## 证据、安全与许可证

- 永远不覆盖原始 PSD；保存只写新的 `/saved/` 路径。
- 桥接不开放任意脚本执行或任意文件路径；请求/响应只经页面纯 JS 队列。
- 无法验证的项一律标记 `unsupported` / `unverified`，不得伪造 Photoshop 结果。
- 大型构建产物、第三方源码、模型和证据媒体不入库；本地证据目录必须新建。
- Patchy 为 MIT；Qt、libheif、ONNX Runtime、模型权重等各自有许可证/NOTICE 要求。
  分发前必须建立 SBOM 并逐项核对，详见 `docs/M0_FEASIBILITY.md` 的许可证章节。
