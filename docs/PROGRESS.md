# 开发进度快照

日期：2026-10-21（Asia/Shanghai）  
阶段：M0 技术验证完成（Photoshop 门禁未验证）；Windows wasm-release 协议 v2 构建完成，真实引擎编组/合并/撤销/保存前后像素对比 E2E 通过；新盘 Nordic mobile 真实语料（4 份 PSD）完成导入/整理/编组/合并/另存重开，其中 1 份保存重开 0 像素差、3 份仍有 0.96%–1.29% 形状/切片层保真差异；M1 Web 工作台 + 规则版一键整理（含逻辑编组、布局提示与合并候选）+ 本地资产包 + 保存前后结构与像素对比 + AI 语义命名导出/审核完成  
Patchy 固定提交：`d1ff95235e00af296868d4253e03391ca002ee9d`

> **2026-10-21 磁盘故障与语料状态**：故障磁盘上的旧语料（`F:\设计稿\伊拉克`）与
> 上一轮 Windows 构建/证据仍不可复查，文中 2026-10-20/21 的伊拉克语料数字保留为
> 历史记录。新盘上的 Nordic mobile 设计稿（`B:\迅雷下载\北欧1019\mobile`，4 份 PSD，
> 总计约 120 MB）已作为只读真实语料完成真实引擎往返与资产包验证（见 2.2.3、2.7），
> 运行前后源文件 SHA-256 一致。`B:\src\LayerForgeAI` 中的代码已重建，Windows
> 工具链已在新盘重装，wasm-core 与 wasm-release 均已重新构建并 staging，真实引擎
> 编组/合并 E2E 已通过。

## 1. 结论

- M0 的构建、桥接、真实 PSD 往返、协议边界和独立证据校验均已完成；**唯一未完成的
  M0 P0 是 Photoshop 2026 无警告打开**，因此仓库状态仍为 `blocked`、
  `m1Allowed=false`。
- 2026-10-21（磁盘故障后重建）：Windows wasm-release 重新链接完成（`patchy.js`
  419,501 B、`patchy.wasm` 87,744,030 B、`patchy.data` 77,138,414 B；SHA-256 见
  `artifacts/patchy-release-sha256.txt`），协议 v2 接入撤销与保存前后像素对比。
  真实 Patchy 浏览器回归 `e2e/patchy-group-merge.spec.ts` 通过（28.9 s）：一键编组、
  撤销、再次编组、一键合并、撤销、再次合并、另存重开；4 份预览 RGBA 哈希完全一致，
  UI 像素差 0/16,000（0.000%），保存 PSD 中 `row-cluster`（4 个子层）与
  `icon-button-merged`（无子层）符合预期，`badge` 组已不存在；证据见
  `artifacts/patchy-roundtrip/manifest.json`。重建中发现真实引擎对 PSD 组返回 0×0
  边界，导致组角色被判为“无有效边界”、合并候选为 0；已让组优先取子层边界并集
  （`roles.ts` 的 `boundsOf`），单元测试与真实 E2E 均通过。新盘 Nordic mobile
  语料（4 份 PSD，21–49 MB）已完成导入、整理、编组/合并与另存重开，源文件均未
  被覆盖；`Store_D.psd` 保存重开 0 像素差，`Payment1_D`、`Payment2_D`、
  `Detial_D_0708` 仍有**0.962%–1.291% 的保存重开预览差异**（最大通道差 236），
  根因是 Patchy 按矢量约定保存形状/切片层（像素通道为空、矢量块保留），重开时
  重新栅格化。旧伊拉克语料（`Payment1` 5.1 MB、`Store_PC` 66.5 MB）数字来自
  故障磁盘，仅作历史记录。
  该行为是否符合 Photoshop 显示约定需门禁验证，详见 2.2.2 与 3.1。未完成事项汇总在
  [3.1](#31-未完成工作清单2026-10-21)。
- 2026-10-20 项目负责人调整开发顺序：**先做界面与整体应用，再做 Photoshop 对接**。
  UI/应用工作据此提前启动，但不得把 M0 或 Photoshop 兼容性标记为通过。
- `apps/web` 已完成 M1 Web 工作台初版（项目、导入、检查、命名计划、保存重开、
  历史、IR 草稿），并新增**规则版一键整理**（结构角色命名、结构检查、编组建议、
  合并候选、切图候选、资产清单）；FastAPI 后端与 AI 模块尚未开始。
- 一键整理的命名与结构检查走本地确定性规则：按边界、层级与子层类型推断组件角色
  （背景、按钮、输入框、角标、图标按钮、卡片等），不读取图层名或 T 文案；重命名复用
  已有“计划 → 应用 → 保存重开验证”路径；编组与合并已加入桥接 v2 白名单（`groupLayers` /
  `mergeLayers`），可在 Patchy 或演示引擎中写入当前文档内存，仍需另存并重开；
  v2 另提供单步 `undo` 与保存前后预览 `comparePreview`，切图候选仍只是建议，
  逐图层渲染未实现。
- 新增**本地资产包导出**：从 PSD 扁平合成图按切图候选边界裁切 1x/2x PNG，逐张
  解码校验，并打包 Design IR、AI 编码上下文、页面对比预览与清单。合并候选区域
  另存为 `merged/` 下的单张 1x/2x PNG，写入 manifest `mergedAssets`，供前端直接
  引用或人工审核。文本层内容、
  字体、字号、颜色、对齐与粗体标记写入 IR `meta` 和 agent-context 文本表。真实
  `Store_PC_D_0706(1).psd` 已生成 250 个切图、500 个输出，全部校验零误差；
  `Payment1` 另有 9 个合并素材、18 个输出全部通过。
  资产包是合成图裁切，不是逐图层隔离渲染，也不是原生 2x，不作为 Patchy/Photoshop
  证据；编组/合并已能经桥接写入文档内存，逐图层隔离渲染仍未实现。
- 新增**保存前后对比**：以本次会话打开时（或上次成功保存后）的快照为基准，与引擎
  重开返回的图层树对比，按图层 ID 优先、路径回退匹配，分类统计重命名/几何/属性/
  新增/移除，历史面板可见并可导出 `layerforge.psd-diff` JSON。v2 另在保存前后各
  渲染一张预览 PNG，由 Patchy 内 `comparePreview` 逐像素比较，显示差异数、比例、
  最大通道差与包围盒，并写入版本记录。两项对比都不是 PSD 二进制或 Photoshop
  渲染结果，独立 Chromium 解码校验仍作为外部证据。
- 新增**逻辑编组输出**：一键整理的 `group-cluster` 建议映射为 Design IR 的
  `logicalGroups` 与节点 `logicalGroupId`，资产包 manifest（v0.3.0）和
  `agent-context.md` 同步输出；AI 编码工具可据此拆分前端组件。该分组只影响 IR 与
  上下文；应用内可一键经桥接写入文档内存，保存并重开后持久化。
- 新增**资产与图层关联**：资产包内 `design-ir.json` 的切图节点写入 `assetId`，
  `agent-context.md` 资产表增加图层路径列，AI 编码工具可把 PNG 直接映射回图层，
  无需按名称猜测。
- 新增**布局提示**：逻辑编组与合并候选按成员边界推断 `layout`
  （row/column/stack、间距、对齐），写入 Design IR v0.4.0、manifest 与
  agent-context 的“布局”列，作为 AI 生成 flex 布局的线索；它是启发式推断，
  不是 PSD 中的布局属性。真实 PSD 上 Store_PC 得到 24 个逻辑编组（4 横向、
  3 纵向、17 叠加）和 24 个合并候选（5 横向、19 叠加）。
- 新增 **AI 语义命名导出/导入/审核**：规则无法处理的通用名汇总为候选，导出
  自包含 Markdown 提示词（`layerforge.ai-naming.request` v0.1.0，含结构、父子/
  兄弟名称、边界、文本样例与布局，不含像素）；把外部 AI 返回的
  `layerforge.ai-naming.response` JSON 导入后，严格校验 schema、候选路径与
  过期状态、名称规范化/长度/通用名/同级冲突/重复路径，逐条展示通过与需修正项，
  用户勾选后才加入命名计划。该流程不调用外部 API、不需要密钥、不直接修改 PSD；
  AI 只产出计划。伊拉克语料共 387 个 AI 候选（单文件 14–136 个；语料已随故障磁盘
  丢失，数字为历史记录）。视觉分析、直接模型 API 与自动批量执行仍未实现。

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

### 2.2.1 Windows WASM 工具链（2026-10-21）

| 项目 | 结果 |
|---|---|
| Qt wasm kit | Qt 6.10.3 `msvc2022_64` host + `wasm_multithread`，aqtinstall 安装 |
| Emscripten | 4.0.7，修复中断解包并补 `.emsdk_version` 后激活 |
| cmake / ninja | 4.4.4 / 1.13.2，安装于 `.deps/aqt-venv` |
| wasm-core 构建 | 完成；wasm 产物 `patchy_core_tests.{js,wasm}` |
| wasm-core 测试 | 执行 1299 项，1191 通过，0 失败，108 跳过（可选样本缺失） |
| wasm-release 配置 | 完成，桥接源码已编入 `patchy_ui` |
| wasm-release 构建 | 重新构建完成；`patchy.js` 419,501 B、`patchy.wasm` 87,744,030 B、`patchy.data` 77,138,414 B |
| 产物 SHA-256 | js `cff853fd…3efea50`、wasm `c3288dd7…8af72b6`、data `fab99b8e…ffe78e36`（完整值见 `artifacts/patchy-release-sha256.txt`） |
| Windows 浏览器 E2E | **通过**：重建产物上真实引擎编组/合并/撤销/另存重开与保存前后像素对比，4 份预览 RGBA 哈希一致，UI 像素差 0，结构断言通过（28.9 s） |
| 真实语料 E2E | **新盘 Nordic mobile（2.2.3）**：4 份 PSD 完成整理、编组/合并与另存重开，源文件未改变；`Store_D` 保存重开 0 像素差，Payment1/Payment2/Detial 保存重开 0.962%–1.291%（已知形状/切片层保真项） |

本轮重建未单独保留 `build.log`，构建入口见下方；产物指纹以
[`artifacts/patchy-release-sha256.txt`](../artifacts/patchy-release-sha256.txt) 为准。

构建入口：[`poc/patchy-bridge/scripts/build-local-wasm.bat`](../poc/patchy-bridge/scripts/build-local-wasm.bat)。
本机 360 安全软件会拦截 `llvm-objcopy`/`llvm-strip`，本地 Emscripten 已改用纯 Python
section stripper（`tools/section_strip.py` + `building.strip` 补丁）。测试二进制是
CommonJS，仓库根 `package.json` 为 ESM，因此测试在临时目录以 `.cjs` 副本运行。

**2026-10-21 新盘重建状态**：emsdk 4.0.7、Qt 6.10.3（host + `wasm_multithread`）、
CMake 4.4.4、Ninja 1.13.2 已重新安装；`wasm-core` 重新构建成功
（`build/wasm-core/patchy_core_tests.{js,wasm}`），核心测试执行 1299 项、1191 通过、
0 失败、108 跳过（可选真实样本缺失），耗时 246.6 s；`wasm-release` 首次配置因
`src/ui/web_bridge_wasm.hpp` 未恢复而失败，补齐后重新配置、编译并完成两轮
`wasm-opt` 链接。Web 侧 `typecheck`/`build` 通过，Vitest 181 项通过 + 1 项环境跳过，
演示 E2E 7 条通过 + 7 条门控跳过（Nordic 语料默认 4 条往返）；staged 重建产物上的真实引擎
`e2e/patchy-group-merge.spec.ts` 通过（28.9 s，0 像素差），证据见
`artifacts/patchy-roundtrip/manifest.json`。重建时发现并修复：真实引擎返回的 PSD
组边界为 0×0，旧逻辑优先采用节点自身边界，使组角色无法识别、合并候选为 0；
`roles.ts` 的 `boundsOf` 改为组优先取子层边界并集。

> 上游 `scripts/wasm/run-core-tests.ps1` 只匹配 `.deps/emsdk/node/*/bin/node.exe`，
> 而 emsdk 4.0.7 的 Windows node 位于 `node/24.19.0_64bit/node.exe`；且测试二进制是
> CommonJS、仓库根 `package.json` 为 ESM。本轮改为在 `build/wasm-core` 内复制
> `patchy_core_tests.js` 为 `.cjs`，直接用内置 node 运行。

### 2.2.2 Windows 真实语料 Patchy 往返（历史：伊拉克语料，故障磁盘前）

> 以下为 2026-10-20/21 故障磁盘前的历史记录，源语料当前不可复查。新盘 Nordic
> mobile 语料的验证结果见 2.2.3。

`e2e/patchy-real-corpus.spec.ts` 在 staged wasm-release 上依次导入、一键整理、
应用首个编组/合并建议、另存并重开，记录耗时、WASM 内存采样与像素差异。

| 文件 | 导入 | 整理 | 编组 | 合并 | 保存重开 | WASM used/peak |
|---|---:|---:|---:|---:|---:|---:|
| `Payment1_D_0708(1).psd`（5.1 MB） | 75.8 s | 0.6 s | 2.8 s（1 组） | 3.4 s（1 个） | 37.2 s | 120→135 MB / 135 MB |
| `Store_PC_D_0706(1).psd`（66.5 MB） | 181.9 s | 0.9 s | 无候选 | 3.3 s（1 个） | 120.7 s | 454→512 MB / 512 MB |

导入/保存耗时高于上一轮（30.7/116.0 s 与 21.4/47.3 s），本轮在刚结束 wasm-opt
构建后运行，机器负载与安全软件扫描不同，差异不代表代码回归。源文件 SHA-256 均
未改变；保存产物 `Payment1` 4.93 MB（图层树 9 个根）、`Store_PC` 63.27 MB（12
个根），结构对比卡片正常生成，console 无 error/pageerror。保存时工作台在引擎内
渲染前后预览并调用 `comparePreview`，UI 记录的差异数与独立 Chromium 解码结果
完全一致（3,215 / 10,686，0.672% / 1.081%）。证据在
`artifacts/patchy-corpus/{payment1,store-pc}/manifest.json`。

**像素差异（同一引擎、同一预览尺寸）**：

| 阶段 | Payment1 差异像素 | 最大通道差 | 说明 |
|---|---:|---:|---|
| 编组 | 890 / 478,208（0.186%） | 9 | 集中在 y=830 的 413×16 区域 |
| 合并 | 18 / 478,208（0.0038%） | 1 | 合并区域 35×36 内 |
| 保存重开（含编辑） | 3,215（0.672%） | 236 | 跨内容区 |
| 保存重开（**未编辑**） | 3,418（0.715%） | 236 | 连续两次预览完全一致，排除渲染随机性 |
| `Store_PC` 合并 | 290 / 988,160（0.029%） | 47 | 199×16 文本区域（`footer-merged`） |
| `Store_PC` 保存重开 | 10,686 / 988,160（1.081%） | 76 | 覆盖整个内容区 |

`Store_PC` 保存重开差异 10,686 / 988,160（1.081%），最大通道差 76，边界
998×950。原样另存用例
显示：46 个图层中 22 个形状/切片图层（`Rectangle …`、`Ellipse …`、`Shape …`、
`-slice-`）保存后只保留矢量掩码与填充块，像素通道按 Patchy 的文档化约定写成空
通道（`psd_layer_records.cpp:337`、`docs/vector-tools.md:246`）；其余图层（含文本
与位图）逐像素完全一致，13 个根图层名称与顺序保持不变。独立 psd-tools 解析确认
保存文件仍是 `shape` 层且带矢量掩码，因此预览差来自 Patchy 重开时按矢量重新
栅格化，而不是编组/合并或桥接引入的数据丢失。该约定是否符合 Photoshop 的显示
行为，仍需 Photoshop 门禁验证。

原文件与保存文件的自带合成图（ag-psd 解码，1242×2718）差异为 265,748 /
3,375,756（7.87%），最大通道差 184。该对比混合了 Photoshop 合成与 Patchy 合成，
只能说明保存文件的扁平图已变化，不能单独归因；**Photoshop 无警告打开与视觉验收
仍未验证**。证据：`artifacts/patchy-corpus/save-fidelity-noop/manifest.json`。

### 2.2.3 Nordic mobile 真实语料 Patchy 往返（2026-10-21，新盘）

真实设计稿位于 `B:\迅雷下载\北欧1019\mobile`（只读）：`Payment1_D.psd`
（21,354,939 B）、`Payment2_D.psd`（21,408,241 B）、`Detial_D_0708.psd`
（28,319,902 B）、`Store_D.psd`（49,482,331 B）。源文件 SHA-256 记录在
`artifacts/patchy-corpus/source-sha256-nordic-mobile.txt`，全部 4 份在运行前后
逐字节一致，工作台只另存新文件。

运行方式：

```sh
LAYERFORGE_REAL_PATCHY=1 LAYERFORGE_PSD_DIR='B:\迅雷下载\北欧1019\mobile' \
LAYERFORGE_CORPUS_CASES='Payment2_D.psd|payment2-nordic,Detial_D_0708.psd|detail-nordic,Store_D.psd|store-nordic' \
PLAYWRIGHT_CHANNEL=chrome npx playwright test e2e/patchy-real-corpus.spec.ts
```

`e2e/patchy-real-corpus.spec.ts` 新增 `LAYERFORGE_CORPUS_CASES`（`文件名|证据目录`）
与 `LAYERFORGE_PRESERVE_PSD`，便于按目录切换语料而不改代码。每份文件执行导入、
一键整理、应用首个编组/合并建议、另存并重开，并独立解码预览 PNG 逐像素比对。

| 文件 | 导入 | 整理 | 编组 | 合并 | 保存重开 | WASM used/peak |
|---|---:|---:|---:|---:|---:|---:|
| `Payment1_D.psd`（21.4 MB） | 42.2 s | 0.56 s | 2.13 s（`card`） | 3.43 s（`icon-button-merged`） | 39.6 s | 155/186 MB |
| `Payment2_D.psd`（21.4 MB） | 48.2 s | 0.58 s | 2.33 s（`card`） | 3.19 s（`icon-button-merged`） | 31.2 s | 156/184 MB |
| `Detial_D_0708.psd`（28.3 MB） | 32.7 s | 0.48 s | 2.43 s（`section`） | 3.61 s（`card-merged`） | 34.7 s | 200/223 MB |
| `Store_D.psd`（49.5 MB） | 41.2 s | 0.69 s | 无候选 | 4.30 s（`icon-button-merged`） | 55.6 s | 337/426 MB |

整理统计（重命名/结构检查/编组/合并/切图）分别为 Payment1 `26/6/1/7/0`、
Payment2 `30/8/1/8/0`、Detial `31/8/1/8/0`、Store `99/50/0/13/0`。有候选的编组与
合并均成功写入引擎内存（`Store_D` 无编组候选）；保存产物图层树根数依次为
9、9、8、10，console 无 `pageerror`，活动日志无 danger 项。

**像素差异（引擎预览，独立 Chromium 解码复核）**：

| 文件 | 编组 | 合并 | 保存重开 | UI 记录 | 结论 |
|---|---:|---:|---:|---:|---|
| `Payment1_D` | 1,024（0.214%，Δ20） | 20（0.00004%，Δ1） | 5,544（1.159%，Δ236） | 1.159% | 仅保真软断言失败 |
| `Payment2_D` | 1,024（0.214%，Δ20） | 20（0.00004%，Δ1） | 6,174（1.291%，Δ236） | 1.291% | 仅保真软断言失败 |
| `Detial_D_0708` | 0（0%，Δ0） | 10（0.00002%，Δ1） | 4,599（0.962%，Δ236） | 0.962% | 仅保真软断言失败 |
| `Store_D` | 无候选 | 0（0%，Δ0） | **0（0%，Δ0）** | 0.000% | **通过，像素一致** |

`Store_D` 提供了同引擎、同保存路径的正向对照：保存并重开后 RGBA 哈希与保存前
完全相同，说明该流程本身可以做到像素一致；Payment1/Payment2/Detial 的差异集中在
y≈223 起的内容区，与形状/切片层按矢量约定保存、重开时重新栅格化的已知保真项
一致。未编辑对照（`Payment1_D` 原样另存）显示连续两次预览哈希一致、保存前后
13 个根图层名称与顺序一致，但仍有 5,725（1.197%，Δ236）像素差，证明差异来自
保存/重开而非编组/合并或渲染随机性；证据在
`artifacts/patchy-corpus/save-fidelity-noop/manifest.json`。

Patchy automation state 对 4 份文件的切图候选均为 0（`slices=0`）；同一
`Payment1_D.psd` 经演示引擎本地解析可产生 40 个切图候选（2.7 资产包），说明切图
候选目前只在演示/本地解析路径可用，Patchy 路径的切图候选生成仍需补齐。每份运行的完整耗时、内存、预览哈希、保存 PSD
SHA-256 与差异包围盒见 `artifacts/patchy-corpus/{payment1-nordic,payment2-nordic,
detail-nordic,store-nordic}/manifest.json`。

### 2.3 浏览器桥接（协议 v2）

- 页面请求/响应队列：`__patchyM0Requests`、`__patchyM0Responses`、
  `__patchyM0Cancelled`；DOM/Promise 回调从不直接调用 WASM export。
- Patchy 侧 `QTimer` 轮询、单请求互斥、超时、取消、应用内完成确认。
- 白名单：`getState`、`openDocument`、`renderPreview`、`comparePreview`、
  `renameLayer`、`groupLayers`、`mergeLayers`、`undo`、`saveAsAndReopen`。
- `renameLayer` / `groupLayers` / `mergeLayers` / `undo` / `saveAsAndReopen`
  必须携带文档 revision 前置条件；可选 fingerprint 必须与当前自动化状态一致。
- `groupLayers` 要求 ≥2 个同一父级的唯一图层 ID；`mergeLayers` 使用
  `keepVectors:false, withinGroups:false, separateVectorTypes:false`，把组内容
  栅格化合并，可选重命名结果层。
- **v2 撤销**：`undo` 调用 Patchy `Document.undo()`，一次命名、编组或合并算一步。
  工作台在一键编组/合并或命名计划应用后提供“撤销上一步”，只回退引擎内存并重算
  一键整理、纠正命名计划路径；源 PSD 不受影响，保存并重开后撤销历史清空。
- **v2 像素对比**：`comparePreview` 在 Patchy 内解码两份已存在的
  `/saved/*.png` 预览，返回 `differingPixels`、`ratio`、`maxDelta`、尺寸与差异
  包围盒。工作台在“保存并重开”前渲染保存前预览、重开后渲染新预览并调用该操作，
  结果显示在历史面板与版本记录中。对比对象是预览 PNG，不是 PSD 二进制，也不能
  替代 Photoshop 验证。
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

### 2.7 M1 Web 工作台（`apps/web`）

技术栈：Vue 3.5 + TypeScript 5.9 + Vite 7 + Pinia 3 + Vue Router 4.6；
ag-psd 31 只读解析；IndexedDB 持久化；Vitest 5 + Playwright 1.64。

| 能力 | 状态 |
|---|---|
| 项目列表、导入 PSD/PSB（≤1.5 GB）、SHA-256、删除级联 | 完成 |
| IndexedDB 项目/源文件/图层树快照（不含 PSD 二进制） | 完成 |
| 图层树搜索、展开/折叠、选择；属性与直接重命名 | 完成 |
| 命名计划：草稿/已应用/已验证/失败，批量应用 | 完成 |
| 保存并重开校验（路径优先、唯一新名称回退） | 完成 |
| 保存前后结构对比（`layerforge.psd-diff` v0.1.0） | 完成；图层树结构、ID/路径匹配、变更分类与 JSON 导出；非像素/二进制对比 |
| 历史版本与图层树快照 | 完成 |
| Design IR 草稿导出（`layerforge.design-ir.draft` v0.4.0） | 完成；含带 `layout` 的 `logicalGroups`、节点 `logicalGroupId` 与资产包 `assetId` |
| 一键整理：结构角色命名 + 重复名消歧 + 通用名识别 | 完成（本地规则；名称由边界与层级推断组件角色，不读取图层名或 T 文案，文本层不改名） |
| AI 语义命名：候选导出、提示词、严格 JSON 导入与人工审核 | 完成；真实语料 387 个候选，无外部 API、不直接修改文档，审核后加入命名计划 |
| 一键整理：空组/单子组检查、逻辑编组、合并候选、切图候选 | 完成；逻辑编组（含布局提示）进入 IR/AI 上下文，可一键写入可写引擎内存；切图仍不写回 PSD |
| 合并候选：紧凑组/复杂角标的规则识别、`merged/` 单张裁剪与 AI 上下文输出 | 完成；名称来自结构角色（如 `badge-merged`、`icon-button-merged`），可通过桥接合并并另存重开 |
| 资产清单导出（`layerforge.asset-manifest.draft` v0.1.0） | 完成；不生成像素 |
| 资产包导出（`layerforge.asset-pack` v0.3.0） | 完成；合成图裁切 1x/2x PNG + 合并素材 + 解码校验 + IR（含逻辑编组布局与 assetId）/AI 上下文/预览 ZIP |
| 文本内容与样式提取（内容/字体/字号/颜色/对齐） | 完成；写入 IR `meta` 与 AI 上下文文本表 |
| 显式堆叠顺序（IR `zIndex`、agent-context `Z` 列） | 完成；同级 0 为最底层（PSD 数组自底向上） |
| Patchy iframe 传输层（协议 v2，含 undo/comparePreview 与 rename/group/merge/saveAsAndReopen） | 已实现；演示引擎单测与真实 Patchy 构建回归见 2.4 |
| 本地只读检查（ag-psd）自动回退 | 完成 |
| 演示引擎（`?engine=demo`） | 完成；仅用于 UI/测试，不作为证据 |

真实 PSD 解析（旧伊拉克语料，历史；`F:\设计稿\伊拉克`，7 份，227 MiB）：全部
无警告，63–475 节点，路径唯一；opacity 0..1 正确换算为百分比；分组空矩形由子节点
并集补齐。仅 `Store_PC_*` 各有一个确实无边界的分组保持无 bounds。

真实 PSD 一键整理（旧伊拉克语料，历史；同一批文件，全部 `ok`）：每个文件都产出
命名建议、编组建议、合并候选与切图候选，断言全部成立（重命名路径存在且唯一、
规范化幂等、合并成员存在且面积占比 ≤8%、切片边界有效）。

| 文件 | 节点 | 重命名 | 通用名 | 重复名 | 编组建议 | 合并候选 | 切图候选 |
|---|---:|---:|---:|---:|---:|---:|---:|
| `Detial_D_0708.psd` | 71 | 52 | 14 | 6 | 4 | 6 | 33 |
| `Payment1_D_0708(1).psd` | 63 | 40 | 16 | 3 | 2 | 9 | 27 |
| `Payment2_D_0708 (1).psd` | 69 | 43 | 19 | 3 | 2 | 9 | 31 |
| `Payment_PC_D_0707(1).psd` | 188 | 130 | 41 | 8 | 7 | 14 | 78 |
| `Store_D_0708(1).psd` | 156 | 110 | 27 | 9 | 10 | 6 | 75 |
| `Store_PC_D_0706(1).psd` | 475 | 304 | 134 | 42 | 24 | 24 | 250 |
| `Store_PC_L_0706(1).psd` | 470 | 299 | 136 | 42 | 24 | 22 | 235 |

`Store_PC_*` 同时各检出 1 个空组与 1 个无边界组；`Store_PC_D` 与 `Store_D` 各检出
1 个单子组。`Payment1` 的 9 个合并候选包括 `Pay Now`（1118×155，占画布 5.1%）、
`Promo Code`（1122×131，4.4%）与 5 个 528×143 的支付方式角标；纯数字组名
（`1`、`2`…）改用唯一文本内容生成 `asia-pay-merged`、`qi-card-merged` 等建议名。
规则命名未覆盖的通用名全部成为 AI 命名候选，共 387 个（14/16/19/41/27/134/136），
路径唯一且与命名建议无重叠；`Store_PC` 单文件 134 个候选是提示词的最大规模。

> 上表与合并候选名（`asia-pay-merged`、`qi-card-merged` 等）来自 2026-10-20 的旧
> 命名规则，当时合并建议取自唯一文本内容；2026-10-21 已改为纯结构角色命名
> （`badge-merged`、`button-merged` 等，不读名称与 T 文案）。语料随故障磁盘丢失，
> 未按新语义重跑，这些数字仅作历史规模参考。新盘 Nordic 语料已按新规则重跑：
> Patchy 路径的整理统计见 2.2.3，演示引擎资产包见下方 Payment1_D 行。

真实 PSD 资产包（合成图裁切 + 逐张 PNG 解码校验）：

**Nordic mobile 新语料（2026-10-21）**：

| 文件 | 尺寸 | 切图 | 切图输出 | 合并素材 | 合并输出 | 校验 | 最大通道差 | 覆盖率 | ZIP |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `Payment1_D.psd` | 1242×2718 | 40 | 80 | 10 | 20 | 50/50 | 0 | 22.7% | 3.6 MB |

E2E 14.0 s 通过：40 个切图、10 个合并素材全部通过逐张 PNG 尺寸与解码校验，
最大通道差 0；IR 节点 `assetId`、逻辑编组、agent-context 与 `preview.html` 断言
均通过。产物在 `artifacts/asset-pack/Payment1_D/`。该用例走演示引擎
（`?engine=demo`，本地 ag-psd + 合成图裁切），不是 Patchy/Photoshop 证据；
Patchy 路径下同一文件切图候选为 0（2.2.3）。

**旧伊拉克语料（历史记录，故障磁盘前）**：

| 文件 | 尺寸 | 切图 | 切图输出 | 合并素材 | 合并输出 | 校验 | 最大通道差 | 覆盖率 | ZIP |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `Payment1_D_0708(1).psd` | 1242×2718 | 27 | 54 | 9 | 18 | 36/36 | 0 | 72.7% | 4.5 MB |
| `Store_PC_D_0706(1).psd` | 3840×3621 | 250 | 500 | 24 | 48 | 274/274 | 0 | 82.9% | 73.2 MB |

资产包 manifest 同步写入 `analysis.merges`、`analysis.mergedAssets` 与
`mergeCandidates`（建议名、类型、成员、边界、面积占比）；`mergedAssets` 记录候选
对应的裁剪边界、输出文件、哈希与逐张解码校验。agent-context 的“合并候选”表增加
`merged/` 文件列并注明尚未写入文档；README 与 comparison 说明合并素材只是合成
裁剪，不参与页面重建覆盖率。
产物写入 `artifacts/asset-pack/<psd>/`（ZIP、manifest、comparison、agent-context、
preview、视觉对比截图与 `visual-diff.json`）；大型 ZIP/PNG 不入库。最大文件构建
耗时约 35 s。

保存前后结构对比（演示与 Patchy 传输共用）：基准是本次会话打开时（或上次保存后）
的图层快照，目标是重开后的图层树；以图层 ID 优先匹配，ID 变化时回退路径；每个
变更图层按主变化归入重命名 > 几何 > 属性，另计新增、移除与未变。报告
`layerforge.psd-diff` v0.1.0 含 baseline 标记、before/after 文档元数据、全部字段
变化（名称、路径、类型、边界、可见性、锁定、不透明度、混合模式、剪贴、文本/字体/
字号/颜色/对齐/粗体/蒙版/效果）与证据说明。历史面板展示 6 项统计、前 6 条变更、
模拟保存警告和“导出对比 JSON”按钮；版本记录保存摘要计数。演示保存的结果明确标注
为模拟。

独立视觉复核（解包 `preview/original-composite.png` 与 `page-reconstruction.png`，
在 Chrome 画布逐像素比较）：

| 文件 | 覆盖像素 | 覆盖区差异像素 | 覆盖区最大通道差 | 未覆盖比例 |
|---|---:|---:|---:|---:|
| `Payment1_D_0708(1).psd` | 2,454,428 | 0 | 0 | 27.29% |
| `Store_PC_D_0706(1).psd` | 11,530,443 | 0 | 0 | 17.07% |

未覆盖比例与 `1 - coverageRatio` 完全一致，说明切图裁切与重建是精确的；剩余差异
只来自没有切图候选覆盖的区域，不是编码或取色误差。

文本提取在真实 `Payment1_D_0708(1).psd` 上产出 17 行文本表，例如
`Pay Now / PingFangSC-Semibold / 48px / #ffffff / center / 粗体` 与
`25,000 / 65.71px / #b511dc / center`；Design IR 节点 `meta` 同步携带相同字段。
`Store_PC` 的 112 个文本层同样进入 IR 与 agent-context。图层树同步输出剪贴、
蒙版、效果与非默认混合模式标记。

真实 PSD 的图层数组顺序为**自底向上**（例如 `Store_PC` 的整页背景
“Rectangle 2” 位于索引 0）。为避免 AI 生成代码时反推层级，Design IR 每个节点
新增 `zIndex`（同级序号，0 为最底层）与 `paintOrder`（整棵树深度优先的全局绘制
序，越大越靠上，可直接映射 CSS z-index），agent-context 的图层树与资产/文本表
同步输出 `z`/`Z` 列，并注明数组顺序语义。

自动化（2026-10-21 本轮）：
- `npm run typecheck` 通过；`npm run build` 通过（164 模块，54.22 s）。
- `npm test`：165 项通过、1 项按环境变量跳过；真实文件套件需
  `LAYERFORGE_PSD_DIR` 才运行（含 AI 候选断言）。
- `npm run test:e2e`：7 条演示引擎用例通过、7 条门控用例跳过（完整流程含保存前后
  结构对比与 JSON 导出、IR 导出、一键整理闭环、一键编组/合并闭环、资产清单导出、
  资产包 ZIP 切图/合并素材解码校验、AI 命名任务导出/导入/审核加入计划）。
- **真实 Patchy 引擎 E2E `e2e/patchy-group-merge.spec.ts`：1 条通过**（staged
  wasm-release，1.1 分钟）；覆盖编组、撤销、再次编组、合并、撤销、再次合并、
  另存重开；4 张预览 PNG 与 1 份 PSD 下载成功，before/grouped/merged/reopened
  RGBA 哈希一致，保存 PSD 结构断言通过；UI 保存前后像素差 0/16,000。
- `e2e/patchy-real-corpus.spec.ts`：支持 `LAYERFORGE_CORPUS_CASES` 按语料切换；
  2026-10-21 对 Nordic 4 份 PSD 记录导入/整理/编组/合并/保存耗时、WASM 内存采样、
  失败项与保存前后像素差，UI 像素差与独立 Chromium 解码一致；`Store_D` 保存重开
  像素一致，另 3 份仅因 0.962%–1.291% 的已知保真差异在软断言失败（2.2.3）。
  历史伊拉克两份数字见 2.2.2。
- 真实 PSD 资产包 E2E（`LAYERFORGE_PSD_DIR` + `LAYERFORGE_REAL_PSD`）
  通过（Nordic `Payment1_D` 14.0 s）：40 个切图、10 个合并素材、80+20 个输出，
  50/50 解码校验 0 误差；旧伊拉克语料历史运行（18.7 s、27+9 个素材）保留在上方
  资产包表。本机浏览器下载受限时可用 `PLAYWRIGHT_CHANNEL=chrome` 复用已安装 Chrome。
- 桥接 PoC `npm test`：12/12 通过（静态门禁已含协议 v2、`comparePreview`、
  `undo` 与 `groupLayers` / `mergeLayers`）。

### 2.8 本轮修复的缺陷

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
6. **IndexedDB 拒绝 Vue Proxy**：项目记录经 `{ ...project }` 展开后仍含响应式
   Proxy，结构化克隆报 `#<Object> could not be cloned`；在仓储写入边界增加深层
   解包 `toPlain`，并保留 Blob/File/Date 身份。
7. **计划统计冻结**：应用计划时原地修改工作数组，保存后数组引用不变，Vue 的
   `hasChanged` 抑制通知，统计 computed 永久缓存；改为在 `savePlan` 中复制条目。
8. **分组边界缺失**：ag-psd 不计算分组矩形，导致所有组显示 0×0；新增
   `unionBounds` 以最深子节点并集推导组边界。
9. **中文项目名文件名回退**：`sanitizeFileName` 原先只保留 ASCII，中文名被压成
   `project`；改用 Unicode 属性转义 `\p{L}\p{N}` 后保留中文，IR/资产清单/保存名
   均受益（已更新对应测试）。
10. **切片候选被静默截断**：真实 `Store_PC_*` 文件超过 200 个候选时被上限截断，
    而 UI 与导出未提示；移除引擎侧上限，仅保留列表显示上限。
11. **Playwright 视口被设备预设覆盖**：项目级 `devices["Desktop Chrome"]` 的
    1280×720 覆盖了顶层 1440×900，触发窄屏媒体查询隐藏按钮文字，导致按名称
    定位失败；改为在项目 `use` 中后置视口，并给“一键整理”按钮补 `aria-label`。
12. **资产包 PNG 校验误报尺寸不符**：`verifyPngAgainstPixels` 在读取宽高前调用
    `ImageBitmap.close()`，关闭后的位图宽高变为 0×0，导致所有资产被标记
    `mismatched`；改为先缓存宽高再关闭，PNG 解码校验恢复为零误差。
13. **形状/切片图层保存后丢失栅格像素**：旧语料 `Payment1` 原样另存重开时，
    `Rectangle …`、`Ellipse …`、`Shape …`、`-slice-` 共 22 个图层在保存 PSD 中
    不再带图层像素数据，重开由矢量重新栅格化，造成 0.672% 预览像素差异（最大通道
    差 236）；位图与文本图层逐像素一致。新盘 Nordic 语料中 3/4 文件为
    0.962%–1.291%（Δ236），`Store_D` 为 0，说明差异与文件中的形状/切片层相关。
    当前只记录并量化，未修改引擎保存路径；需在 Photoshop 中确认矢量数据是否可
    正常打开，或在 Patchy 保存时保留栅格像素。

## 3. 未完成项与风险

| 优先级 | 项目 | 状态 |
|---|---|---|
| P0 | Photoshop 2026 无警告打开 | 未验证；本机未安装 Photoshop；M0 因此不通过 |
| P0 | Windows wasm-release 最终产物 | 完成（2026-10-21 重建）；`patchy.js` 419,501 B、`patchy.wasm` 87,744,030 B、`patchy.data` 77,138,414 B，SHA-256 已记录 |
| P1 | Windows 官方构建 lane | 工具链、核心测试与 wasm-release E2E 完成；CI lane 脚本尚未在本机全量执行 |
| P1 | 100+ 图层获批真实设计 PSD/PSB | 未提供（M1 输入） |
| P1 | Vue3 Web 工作台 | 初版完成；真实 Patchy 引擎编组/合并/保存回归通过 |
| P1 | 规则版一键整理（命名/结构/逻辑编组/合并候选/切图候选/资产清单） | 完成；命名、编组与合并可经可写引擎执行并另存重开；切图仍为候选 |
| P2 | 逻辑编组与布局提示写入 Design IR / AI 编码上下文 | 完成；`logicalGroups`/`logicalGroupId`/`layout`，不修改 PSD |
| P1 | 本地资产包（合成图裁切 + 解码校验 + IR/AI 上下文/ZIP） | 完成；Nordic `Payment1_D` 40 个切图 + 10 个合并素材、50/50 零误差（演示引擎） |
| P1 | 保存前后结构对比（`layerforge.psd-diff`） | 完成；图层树结构，非像素/二进制 |
| P1 | Patchy `selectLayer` 双向高亮 | 未实现 |
| P1 | Web 工作台真实 Patchy E2E | 合成 PSD 通过（重建产物，28.9 s）；Nordic 4 份真实语料完成往返，UI 像素差与独立计算一致；`Store_D` 保存重开 0 像素差，其余 3 份 0.962%–1.291%，见形状层保真项 |
| P1 | 形状/切片图层保存保真 | 已量化：保存按矢量约定写空像素通道并保留矢量块；Nordic 中 3/4 文件重开差异 0.962%–1.291%（Δ236），`Store_D` 为 0；待 Photoshop 验证显示与兼容性 |
| P1 | FastAPI + SQLite 项目/版本/任务 API | 未开始 |
| P1 | AI 语义命名、审核、批量执行 | 提示词导出、严格 JSON 导入、人工审核与加入计划完成；直接模型 API、视觉输入与批量执行未开始 |
| P1 | tab 崩溃恢复、大响应分块/流式传输 | 未实现 |
| P1 | 大文件/内存测试、完整 SBOM | 部分完成：21–49 MB 的真实 PSD 已记录耗时与 WASM 内存（峰值 184–426 MB）；完整 SBOM 未生成 |
| P2 | 逐图层隔离渲染切图、像素级回写对比 | 应用内保存前后预览像素对比已实现（`comparePreview`）；逐图层隔离渲染与 PSD 二进制对比未实现 |
| P2 | 编组/合并桥接写回与一键操作 | 完成；协议 v2 单步撤销与保存前后像素对比在真实 Patchy 回归通过，演示引擎单测同步覆盖 |
| P2 | Design IR 校验与发布格式（M5） | 仅草稿导出 |

### 3.1 未完成工作清单（2026-10-21）

按执行顺序排列，完成一项勾选一项；不得用演示引擎、合成图裁切或图层树差异替代
Patchy/Photoshop 证据。

**P0：真实引擎闭环**

- [x] **完成 wasm-release 收尾**：重建后最终链接成功，`patchy.js` 419,501 B、
  `patchy.wasm` 87,744,030 B（两轮 wasm-opt 后）、`patchy.data`
  77,138,414 B。SHA-256 记录在 `artifacts/patchy-release-sha256.txt`。
- [x] **真实验证编组/合并/撤销与像素对比**：重建产物 staged 后用
  `LAYERFORGE_REAL_PATCHY=1 PLAYWRIGHT_CHANNEL=chrome npx playwright test e2e/patchy-group-merge.spec.ts`
  通过（28.9 s）。覆盖编组、撤销、再次编组、合并、撤销、再次合并、另存重开；
  4 张预览 PNG + 1 份 PSD 下载成功；before/grouped/merged/reopened RGBA 哈希
  一致；UI 保存前后像素差 0/16,000（0.000%）；PSD 中 `row-cluster` 含 4 个子层、
  `icon-button-merged` 无子层、原 `badge` 组不存在；源文件哈希不变；console 无
  `error`/`pageerror`；证据在 `artifacts/patchy-roundtrip/manifest.json`。
- [x] **重建回归缺陷修正**：真实引擎把 PSD 组边界报告为 0×0，旧逻辑使组角色判为
  “无有效边界”、合并候选为 0；`roles.ts` 的 `boundsOf` 改为组优先取子层边界并集，
  并补 Vitest 覆盖 0×0 组边界，真实 E2E 随通过。
- [x] **失败修正**：重新链接 v2 wasm 后真实引擎回归通过；期间修正 PoC 静态测试
  白名单断言（补 `comparePreview` / `undo` 与协议版本 2），无需改
  `web_bridge_wasm.cpp` 协议逻辑。
- [x] **历史真实语料往返（故障磁盘前）**：`Payment1_D_0708(1).psd` 与
  `Store_PC_D_0706(1).psd` 曾在 v2 staged wasm-release 上完成导入、整理、
  编组/合并、另存重开；UI 像素差与独立 Chromium 解码一致（3,215 / 10,686）。
  数字保留在 2.2.2，源语料当前不可复查。
- [x] **新盘 Nordic mobile 真实语料**：`Payment1_D`、`Payment2_D`、
  `Detial_D_0708`、`Store_D` 四份 PSD（21–49 MB）全部完成导入、一键整理、
  编组/合并与另存重开；源文件 SHA-256 运行前后一致；`Store_D` 保存重开
  0 像素差，其余 3 份仅因已知形状/切片层差异（0.962%–1.291%，Δ236）触发
  软断言失败。证据在
  `artifacts/patchy-corpus/{payment1-nordic,payment2-nordic,detail-nordic,store-nordic}/manifest.json`，
  源哈希在 `artifacts/patchy-corpus/source-sha256-nordic-mobile.txt`。
- [x] **Nordic 资产包**：`Payment1_D.psd` 经演示引擎生成 40 个切图（80 个输出）
  与 10 个合并素材（20 个输出），50/50 逐张 PNG 校验通过、最大通道差 0，
  证据在 `artifacts/asset-pack/Payment1_D/`。该结果不是 Patchy/Photoshop 证据；
  Patchy 路径下同一文件切图候选为 0，图层边界/类型映射仍待补齐。
- [ ] **Photoshop 2026 无警告打开**：本机不可用；需在具备 Photoshop 的 Windows
  主机运行 `ci/photoshop-m0-check.ps1` 并通过完整 verifier 后才能更新 M0；之前
  保持 `blocked` / `m1Allowed:false`。`Store_D` 保存重开 0 像素差提供了正向
  对照，但 Payment1/Payment2/Detial 仍包含按矢量约定保存的形状/切片层，必须在
  Photoshop 中确认能否无警告打开并正常显示。

**P1：距离最终目标的功能缺口**

- [ ] **形状层矢量保存的 Photoshop 兼容性**：旧语料 `Payment1` 原样另存后，22 个
  `Rectangle`/`Ellipse`/`Shape`/`-slice-` 图层按 Patchy 文档化约定只写矢量块与
  空像素通道（`psd_layer_records.cpp:337`），矢量掩码与填充块经 psd-tools 确认
  保留。新盘 Nordic 语料中 Payment1/Payment2/Detial 重开预览差
  0.962%–1.291%（Δ236），`Store_D` 为 0，说明差异与文件内容相关而非保存路径
  必然失败。需在 Photoshop 中确认这些层能无警告打开并正常显示；若 Photoshop 不
  重建填充，再修改保存路径写入栅格预览。原样另存回归已在
  `patchy-real-corpus.spec.ts` 的“保存保真”用例中，4 份语料的编辑后保存重开见
  2.2.3。
- [ ] **逐图层/逐组隔离渲染与切图**：协议 v2 仍只有整文档 `renderPreview`，当前
  切图是合成图按边界裁切；需新增按图层渲染操作，才能生成真正的独立资产与原生 2x。
- [ ] **合并策略与回滚**：clipping 边界与复杂组会被 Patchy 合并检查阻止，桥接固定
  `withinGroups:false`。需评估 `withinGroups`/`keepVectors`/单层栅格化选项，在 UI
  明确失败原因；单次撤销已提供，批量编组/合并的事务回滚仍缺失。
- [ ] **像素级与二进制对比**：现有 `layerforge.psd-diff` 只比较图层树；需逐图层
  像素差异、保存 PSD 字节或独立解析结果对比，并保留独立解码校验。
- [ ] **资产包转正**：当前 `validated:false`、切图为合成裁剪、`merged/` 不是 PSD
  合并结果；逐层渲染落地后重新生成，并以 Photoshop/独立解析结果作为验证依据。
- [ ] **桥接 v2**：新增 `selectLayer`（画布↔图层树高亮）、批量重命名、可见性操作、
  大响应流式/分块；保持前置条件与白名单约束。
- [ ] **后端与 AI 执行**：FastAPI + SQLite 项目/版本/任务/审计未开始；AI 直接模型
  API、视觉输入与批量执行未开始，AI 仍只产出计划、执行走白名单桥接。

**P2：工程化与收尾**

- [x] **全量回归**：本轮 `npm run typecheck`、`npm run build`、181 项单测（+1
  环境跳过）、7 条演示 E2E、v2 真实 Patchy 合成 E2E（通过）、4 条 Nordic 真实
  语料往返（3 条仅保存重开像素软断言失败，`Store_D` 通过）、保存保真对照与真实
  资产包 E2E（`Payment1_D` 14.0 s 通过）均已运行。
- [ ] **大文件与内存**：已完成 5.1 MB / 66.5 MB 真实 PSD 的导入、保存耗时与 WASM
  内存采样（2.2.2）；仍缺低内存机器对照、完整 SBOM 与 87.7 MB wasm + 77.1 MB
  data 对首屏的影响评估。
- [ ] **崩溃恢复**：tab 崩溃后的请求恢复尚未实现；当前只有单请求互斥、超时与取消。
- [ ] **文档收尾**：把 Windows 最终产物大小、真实 E2E 哈希与失败项写回
  README/PROGRESS；大型 PSD/PNG/trace 继续留在 `artifacts/`，不入库。
- [ ] **Git 提交**：尚未创建任何提交；按约定需项目负责人明确要求后再提交。

**当前硬阻塞**：Photoshop 2026 无警告打开（本机未安装 Photoshop）。真实引擎构建、
合成 PSD 编组/合并/保存回归与 Nordic 真实语料往返已完成，但 3/4 文件仍有
0.96%–1.29% 的形状层保存重开像素差异（`Store_D` 为 0），需在 Photoshop 中确认
矢量层显示并决定修复方式。在 Photoshop 证据落地前，不得把 M0 标记为通过，也不得
宣称保存 PSD 与源文件视觉一致。

主要风险：

- 没有 Photoshop 证据，不能承诺输出 PSD 在 Photoshop 中无警告；Patchy 自保存/重开
  不能替代该检查。
- 真实语料已覆盖 4 份 Nordic mobile PSD（21–49 MB）；保存/重开在 3 份含形状/切片
  层的文件中出现 0.96%–1.29% 差异（Δ236），`Store_D` 为 0，说明不能把该问题简单
  归因于保存路径，也不能据此承诺通用保真度；含智能对象、蒙版、调整层组合的复杂
  文件仍未纳入语料。
- 桥接响应仍是整包 JSON；大图/大计划需要分块或改成文件句柄。
- 真实 49.5 MB PSD 已在 Patchy 模式下跑完导入→保存重开（导入 41.2 s、保存 55.6 s、
  WASM 峰值 426 MB）；4 份 21–49 MB 语料的导入为 32.7–48.2 s、保存重开为
  31.2–55.6 s；但 87.7 MB wasm + 77.1 MB data 的首屏加载、低内存机器行为仍只在
  单机验证，未做内存上限压测。
- 一键整理按边界、层级与子层类型推断组件角色，不理解设计语义，也不读取图层名或
  T 文案：名称只来自角色（按钮、输入框、角标、图标按钮、卡片等），文本层、调整层
  与无法识别的图层保留原名；同名角色按同级作用域追加 `-2`/`-3`。逻辑编组建议
  可能不符合设计意图，建议本身不会自动写入；应用内可一键经桥接写入文档内存，
  保存并重开后持久化，未保存或失败时不改变源文件。切图候选只是图层/组边界，
  不是逐图层隔离渲染的像素；这些结果在 UI 中明确标注为建议。合并候选按面积占比
  （≤8%）、聚合度与结构角色筛选，可能把需要保留独立图层的紧凑组算进来；
  clipping 边界或复杂组会被引擎拒绝，执行合并仍需人工审核；“撤销上一步”可回退
  单次编组/合并，但批量操作没有事务级回滚。
- AI 命名看不到像素，只能依据图层结构、名称、边界与文本样例；提示词与响应均为
  本地文件，需用户自行交给外部 AI 并逐条复核。Store_PC 单文件 134 个候选，提示词
  体量较大；过期候选、路径变化与同级冲突会被拒绝，但仍不能保证语义正确。该流程
  不调用外部 API，也不替代视觉模型或人工设计判断。
- 资产包从扁平合成图裁切：重叠的其它图层会一起截入，隐藏/蒙版/混合模式按合成结果
  呈现；2x 是最近邻放大而非原生渲染。`merged/` 是合并候选区域的同一套合成裁剪，
  不是 PSD 合并，也不参与页面重建覆盖率。它适合快速交付与 AI 编码上下文，不能替代
  Patchy/Photoshop 的逐图层隔离导出与最终视觉验收。
- 应用内保存前后对比是引擎返回图层树的结构对比：ID 不稳定且结构同时增删时，路径
  回退可能把同位置的不同图层配成“重命名”。E2E 另补了预览 PNG 逐像素差与 ag-psd
  图层属性对比，但仍不验证蒙版渲染、嵌入资源或 PSD 二进制完整性，不能替代
  Photoshop 视觉回归。
- 文本提取使用基础样式；多段样式只记录 `textRuns` 数量，不展开每段字体与颜色。

## 4. 开发顺序调整（2026-10-20）

项目负责人明确要求：**先把界面、整体应用开发到可用，再对接 Photoshop 相关能力。**

这意味着：

- 第一优先级 `apps/web` 已完成初版（项目列表、导入、图层树、属性/重命名、计划、
  保存重开、历史、IR 草稿），并完成规则版一键整理（命名、结构检查、逻辑编组、
  合并候选、切图候选、资产清单）与本地资产包（合成图裁切、合并素材裁剪、解码校验、
  含逻辑编组的 AI 上下文、预览）；Patchy 画布双向选择仍待 `selectLayer` 扩展。
- 随后接入 FastAPI + SQLite 项目/版本/任务/审计 API。
- Photoshop 无警告打开与 Windows 官方 lane 继续作为兼容性门禁保留，在具备环境的
  主机上补做；在完成前不得宣称 Photoshop 兼容。
- M0 报告仍保持“门禁未全部通过”的结论；状态文件中的 `m1Allowed:false` 只代表
  M0 门禁，不代表负责人禁止 UI 工作。

## 5. 下一阶段任务拆分

1. **Web 工作台回归**：Windows wasm-release 协议 v2 已 staged，
   `e2e/patchy-group-merge.spec.ts` 真实引擎编组/合并/撤销/另存重开与保存前后
   像素对比已通过；`e2e/patchy-real-corpus.spec.ts` 已完成 Nordic 4 份 PSD 的
   往返，UI 像素差与独立计算一致，`Store_D` 保存重开 0 像素差，其余 3 份仅
   保存重开保真软断言失败。Photoshop 无警告门禁仍未通过，不得提升 `m1Allowed`。
   当前阻塞与验收项见 3.1。
2. **桥接 v2 收尾**：`undo` 与 `comparePreview` 已在真实引擎验证；下一步补
   `selectLayer` 画布 ↔ 图层树双向高亮、逐图层渲染、可见性操作与大响应分块。
3. **逐图层渲染与二进制对比**：图层树结构对比（`layerforge.psd-diff`）与保存前后
   预览 PNG 像素对比已交付；下一步用逐图层渲染生成隔离切图与原生 2x，并补 PSD
   二进制/独立解析对比。
4. **AI 语义命名**：提示词导出、JSON 导入、严格校验与审核加入计划已交付；下一步
   通过 FastAPI 代理接入模型与视觉输入并支持批量执行，AI 仍只输出计划、执行走
   白名单桥接。
5. **后端**：FastAPI + SQLite 项目、revision、任务与审计；浏览器执行任务状态需区分
   `interrupted`，不能伪造完成。
6. **Photoshop 门禁**：在交互式 Windows 主机运行
   `ci/photoshop-m0-check.ps1`，通过完整 `verify:evidence` 后才更新 M0 结论。

## 6. 复现入口

```sh
# Web 工作台
cd apps/web && npm install
npm run typecheck && npm test && npm run build
PLAYWRIGHT_CHANNEL=chrome npm run test:e2e   # 可选：复用已安装 Chrome

# 真实 PSD 资产包 E2E（演示引擎；生成 ZIP 与轻量证据到 artifacts/asset-pack）
LAYERFORGE_PSD_DIR='B:\迅雷下载\北欧1019\mobile' LAYERFORGE_REAL_PSD='Payment1_D' \
  PLAYWRIGHT_CHANNEL=chrome npx playwright test e2e/asset-pack-real.spec.ts

# 真实 Patchy 引擎编组/合并/撤销/像素对比 E2E（已 staged wasm-release）
cd apps/web
npm run stage:patchy -- ../../vendor/Patchy/build/wasm-release
LAYERFORGE_REAL_PATCHY=1 PLAYWRIGHT_CHANNEL=chrome \
  npx playwright test e2e/patchy-group-merge.spec.ts

# 真实语料 Patchy 往返（导入/整理/编组/合并/另存重开，证据到 artifacts/patchy-corpus）
LAYERFORGE_REAL_PATCHY=1 LAYERFORGE_PSD_DIR='B:\迅雷下载\北欧1019\mobile' \
LAYERFORGE_CORPUS_CASES='Payment1_D.psd|payment1-nordic,Payment2_D.psd|payment2-nordic,Detial_D_0708.psd|detail-nordic,Store_D.psd|store-nordic' \
  PLAYWRIGHT_CHANNEL=chrome npx playwright test e2e/patchy-real-corpus.spec.ts

# 原样另存保真对照（不编辑；默认 Payment1_D.psd，可用 LAYERFORGE_PRESERVE_PSD 覆盖）
LAYERFORGE_REAL_PATCHY=1 LAYERFORGE_PSD_DIR='B:\迅雷下载\北欧1019\mobile' \
LAYERFORGE_PRESERVE_PSD='Payment1_D.psd' \
  PLAYWRIGHT_CHANNEL=chrome npx playwright test e2e/patchy-real-corpus.spec.ts -g '保存保真'

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
