# 开发进度快照

日期：2026-10-20（Asia/Shanghai）  
阶段：M0 技术验证完成（Photoshop 门禁未验证）；Web UI/整体应用尚未开始  
Patchy 固定提交：`d1ff95235e00af296868d4253e03391ca002ee9d`

## 1. 结论

- M0 的构建、桥接、真实 PSD 往返、协议边界和独立证据校验均已完成；**唯一未完成的
  M0 P0 是 Photoshop 2026 无警告打开**，因此仓库状态仍为 `blocked`、
  `m1Allowed=false`。
- 2026-10-20 项目负责人调整开发顺序：**先做界面与整体应用，再做 Photoshop 对接**。
  UI/应用工作据此提前启动，但不得把 M0 或 Photoshop 兼容性标记为通过。
- 当前仓库没有 Vue UI、FastAPI 后端或 AI 模块；下一阶段从 Web 工作台开始。

## 2. 已完成内容

### 2.1 源码、许可证与 API 审计

- 固定 Patchy 提交并完整阅读 `AGENTS.md`、`docs/wasm.md`、
  `scripts/bundled/scripting-guide.md`、`patchy.d.ts`、`LICENSE`、
  `docs/ps-compat.md` 及第三方 NOTICE。
- 确认 WASM 构建、MEMFS 文件 staging、浏览器下载、递归图层 automation state、
  `app.open/getDocument/getLayer/renderPreview/saveAs/close` 等真实入口。
- 结论：项目内不存在现成的 Web RPC；新增桥接，不假设外部可直接调用 Patchy 内部
  脚本上下文。

### 2.2 macOS WASM 构建

| 项目 | 结果 |
|---|---|
| wasm-core 配置/构建 | 完成 |
| CTest | 1/1 通过；执行 1299 项，1192 通过，0 失败，107 跳过，20.6 s |
| wasm-release | `patchy.wasm` 87,709,513 B；`patchy.data` 77,155,674 B |
| 桥接编译 | `web_bridge_wasm.cpp` 编入真实 `patchy_ui`，桥接 0 警告 |
| 上游既有警告 | 2 条（AVIF 未使用函数、coalesced pointer 未使用字段） |
| Windows 官方 lane | 未运行 |

构建脚本：[`ci/macos-wasm-m0.sh`](../ci/macos-wasm-m0.sh)。脚本会核对固定 SHA、
复制/接线桥接、构建两个 target、运行 CTest 与浏览器 E2E，并调用独立 verifier。

### 2.3 浏览器桥接（协议 v1）

- 页面请求/响应队列：`__patchyM0Requests`、`__patchyM0Responses`、
  `__patchyM0Cancelled`；DOM/Promise 回调从不直接调用 WASM export。
- Patchy 侧 `QTimer` 轮询、单请求互斥、超时、取消、应用内完成确认。
- 白名单：`getState`、`openDocument`、`renderPreview`、`renameLayer`、
  `saveAsAndReopen`。
- `renameLayer` / `saveAsAndReopen` 必须携带文档 revision 前置条件；可选
  fingerprint 必须与当前自动化状态一致。
- 路径限制：打开只接受 `/opened/<number>/<name>`；输出只接受 `/saved/` 直接
  子文件；preview/PSD 已存在时拒绝覆盖；请求 JSON 上限 64 KiB。
- 稳定错误码：`PROTOCOL_MISMATCH`、`INVALID_REQUEST`、`PRECONDITION_REQUIRED`、
  `STALE_DOCUMENT`、`DOCUMENT_NOT_FOUND`、`BUSY`、`SCRIPT_ERROR`、`CANCELLED`；
  浏览器侧另有 `TIMEOUT`、`DISPOSED`、`REQUEST_FAILED`。

### 2.4 真实 PSD 往返

真实样本：`vendor/Patchy/test-fixtures/psd/photoshop-clip-base-effects.psd`
（360×100，29 层，14 个 clipping 关系；不随应用分发）。

| 断言 | 结果 |
|---|---|
| 源 PSD SHA-256 前后不变 | `ac492156547a772ba120f1d3a0d1b0164836d719100eb51e54c2a3c8f12ae66a` |
| 输出 PSD SHA-256 | `cf6cb55011599824370e159ab6c7e81f24666551155b2d963b1576215ea84f5a` |
| 文档 ID | `1 → 2`，重开后重新查询层 ID |
| 重命名 | `Background → Background [M0]`，重开后存在 |
| before/after PNG | 均 360×100，独立 Chromium 解码 RGBA SHA-256 均为 `b22584a6cfae011f3875ebeb4c126126550f10c668bcc2aeb86995d450fd18c4` |
| 浏览器下载 | 恰好 3 次：before PNG、normalized PSD、after PNG |
| 独立 psd_tools 解析 | 29 层、14 个 clipping 关系保留、重命名层存在、层序一致 |
| console | 无 `error` / `pageerror` |

130 层合成压力样本（1024×768，5 组，130 个非根图层）同样通过：源 SHA-256
`79ef4bf26b432d6f66a88c637c2e369409ed12a0e453b50fd337de86acc8305c`，
输出 SHA-256 `396473e3618c58dfafe82826705319efef415cb120c3b9994fe4e7bd2c9b0f72`，
before/after RGBA SHA-256 均为
`e07486f069dd4192703bce127dd24798a53d15fd81377d782de5cf028900eeac`。
该样本只覆盖图层数量，不代表真实设计复杂度。

### 2.5 真实浏览器协议边界（8/8）

在真实 WASM 浏览器中全部通过：

1. 缺失前置条件 → `PRECONDITION_REQUIRED`
2. 过期 revision/fingerprint → `STALE_DOCUMENT`
3. 越界 preview 路径 → `INVALID_REQUEST`
4. 非 staging 输入路径 → `INVALID_REQUEST`
5. 未知操作/任意脚本 → `INVALID_REQUEST`
6. 覆盖已有 preview → `SCRIPT_ERROR`
7. 覆盖已有 PSD → `SCRIPT_ERROR`
8. 所有拒绝请求后 automation fingerprint 与层名不变

### 2.6 证据与 CI

- 独立浏览器 verifier：重新计算源/输出哈希，独立 Chromium 解码 PNG RGBA，
  检查 8BPS header、重开截图、console、trace；输出
  `photoshopVerified:false`、`m0Accepted:false`。
- 完整 verifier：额外要求恰好一条 Photoshop `CLEAN`，复核 8 项协议检查；缺少
  `photoshop-open-check.log` 时明确拒绝且不写验收文件（已做负向验证）。
- 最新证据：`artifacts/m0/browser-20261020-06/`；构建/测试日志：
  `artifacts/m0/logs/macos-20261020-191428/`。
- CI 脚本端到端重跑：CTest 1/1（20.63 s）、E2E 1 passed（4.0 s）、verifier
  `ok:true`；同一 fixture 在 `-03`、`-05`、`-06` 三次运行的源/输出/RGBA 哈希
  完全一致。
- 大型证据（PSD/PNG/trace）与构建产物不入库；`artifacts/m0/status.json` 与
  本快照保留状态和哈希。

### 2.7 本轮修复的缺陷

1. **重复下载 PSD**：Patchy 保存协调器已通过
   `offer_browser_download_for_saved_file` 提供下载，桥接又下载一次，导致 4 次
   下载；移除桥接侧重复下载后为 3 次。
2. **`BUSY` 误分类**：`run_source()` 在脚本抛错时也返回 `false`，桥接误报为
   `BUSY`；改为启动前检查 `run_active()`，脚本错误经完成回调返回
   `SCRIPT_ERROR`。真实 WASM 协议断言暴露了该问题。
3. **CI 脚本相对路径失效**：相对 `--pre-js`/toolchain 路径在独立构建目录中失效；
   现在所有输入/产物路径先绝对化。
4. **Qt WASM toolchain 环境缺失**：脚本未导出 `EMSDK`/`EM_CONFIG`；现在显式导出
   并检查 `.emscripten`。
5. **verifier 缺日志错误不清晰**：缺少 Photoshop 日志时原先抛原始 ENOENT；现在
   返回 `M0 evidence invalid: photoshop-open-check.log is missing or empty`。

## 3. 未完成项与风险

| 优先级 | 项目 | 状态 |
|---|---|---|
| P0 | Photoshop 2026 无警告打开 | 未验证；本机未安装 Photoshop；M0 因此不通过 |
| P1 | Windows 官方构建 lane | 未运行 |
| P1 | 100+ 图层获批真实设计 PSD/PSB | 未提供（M1 输入） |
| P1 | Vue3 Web 工作台 | 未开始（下一步） |
| P1 | FastAPI + SQLite 项目/版本/任务 API | 未开始 |
| P1 | AI 语义命名、审核、批量执行 | 未开始 |
| P1 | tab 崩溃恢复、大响应分块/流式传输 | 未实现 |
| P1 | 大文件/内存测试、完整 SBOM | 未完成 |
| P2 | 编组、安全合并、视觉差异、Design IR/资产包 | 未开始 |

主要风险：

- 没有 Photoshop 证据，不能承诺输出 PSD 在 Photoshop 中无警告；Patchy 自保存/重开
  不能替代该检查。
- 29 层真实样本与 130 层合成样本不能证明复杂设计文件（智能对象、文字、蒙版、
  调整层组合）的保真度。
- 桥接响应仍是整包 JSON；大图/大计划需要分块或改成文件句柄。
- WASM 内存与浏览器下载行为只在大约 87 MB wasm + 77 MB data 的 macOS 构建上
  验证过，Windows 官方构建尚未对照。

## 4. 开发顺序调整（2026-10-20）

项目负责人明确要求：**先把界面、整体应用开发到可用，再对接 Photoshop 相关能力。**

这意味着：

- 下一步优先级是 `apps/web`（Vue3 + TypeScript + Vite + Pinia）：项目列表、PSD
  导入、Patchy 画布、图层树、双向选择、属性/重命名、审核、保存重开、导出。
- 随后接入 FastAPI + SQLite 项目/版本/任务/审计 API。
- Photoshop 无警告打开与 Windows 官方 lane 继续作为兼容性门禁保留，在具备环境的
  主机上补做；在完成前不得宣称 Photoshop 兼容。
- M0 报告仍保持“门禁未全部通过”的结论；状态文件中的 `m1Allowed:false` 只代表
  M0 门禁，不代表负责人禁止 UI 工作。

## 5. 下一阶段任务拆分

1. **Web UI 基础**：Vue3/Pinia/Router、应用外壳、项目列表、本地 IndexedDB 项目
   持久化、PSD 导入与尺寸解析。
2. **编辑器**：同源嵌入 Patchy、加载状态、画布工具栏、图层树搜索/展开/选择、
   属性面板、重命名与保存重开、下载记录、日志。
3. **桥接补全**：新增 `selectLayer`（及必要的只读操作）以支持画布 ↔ 图层树双向
   高亮；为新增操作补协议、静态测试和真实 WASM E2E。
4. **审核/对比/导出**：待命名变更列表、应用状态、before/after 预览、IR JSON 导出。
5. **后端**：FastAPI + SQLite 项目、revision、任务与审计；浏览器执行任务状态需区分
   `interrupted`，不能伪造完成。
6. **Photoshop 门禁**：在交互式 Windows 主机运行
   `ci/photoshop-m0-check.ps1`，通过完整 `verify:evidence` 后才更新 M0 结论。

## 6. 复现入口

```sh
# 浏览器侧单元/静态测试
cd poc/patchy-bridge && npm ci && npm test

# macOS 构建 + 真实 PSD E2E + 独立证据校验
ci/macos-wasm-m0.sh \
  vendor/Patchy "$PWD" \
  vendor/Patchy/test-fixtures/psd/photoshop-clip-base-effects.psd \
  "$PWD/artifacts/m0/browser-$(date +%Y%m%d-%H%M%S)"
```

详细阻塞、证据路径和门禁命令见
[M0_FEASIBILITY.md](M0_FEASIBILITY.md)。状态机读 `artifacts/m0/status.json`。
