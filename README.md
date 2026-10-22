# LayerForgeAI

**PSD Normalize Studio Web**：基于 [Patchy](https://github.com/SethRobinson/Patchy) 的本地优先 PSD 规范化工作台。

目标是在浏览器中打开 PSD、读取真实图层树、审核 AI/人工命名建议、应用批量重命名、另存并重开验证，最终导出 normalized PSD、PNG 资产与 Design IR。Patchy 是 PSD 编辑与渲染引擎；本项目的 AI 只输出计划，执行器只通过白名单桥接操作修改文档。

## 当前状态（2026-10-22）

| 项目 | 状态 |
|---|---|
| Patchy 源码/API/许可证审计 | 完成 |
| 固定提交 `d1ff952` 的 macOS WASM 构建 | 完成 |
| 浏览器 ↔ Patchy 桥接（协议 v2，含 `renderLayer` 隔离渲染） | 完成；真实引擎合成 PSD 编组/合并/撤销/另存重开、保存前后像素对比与逐层隔离切图通过 |
| 真实 29 层 PSD / 130 层合成样本回归 | 完成 |
| 真实浏览器协议边界检查（8 项） | 完成 |
| 独立浏览器证据校验 + 完整门禁负向测试 | 完成 |
| macOS 可复现 CI 脚本 | 完成并端到端重跑 |
| Photoshop 2026 无警告打开 | **完成（2026-10-22）**：Photoshop 27.11 以默认（可见）对话框打开 `m0-normalized.psd` 无警告；Nordic 原始 5/5、Patchy 保存输出 5/5、AI 合并产物 4/4 也全部 CLEAN（`artifacts/photoshop-checks/20261022/open-checks.log`、`ai-merge-open-checks.log`） |
| 形状/切片层保存保真 | **完成（2026-10-22）**：`save-fidelity.patch` 让带 Photoshop 光栅预览的形状层在 RGB 另存时写回预览；Payment1 原样另存与 Nordic 4 份编辑后保存重开均为 0 像素差（此前 3 份为 0.547%–0.844%，Δ236）；原生色彩模式保存仍保持空通道约定 |
| Windows 官方构建 lane | 未运行 |
| 100+ 图层获批真实设计样本 | 已提供（2026-10-21：`B:\迅雷下载\北欧1019\mobile`，4 份 PSD，只读） |
| Vue3 Web 工作台（`apps/web`） | **初版完成**：导入、检查、一键整理、AI 语义命名与合并复核审核、计划、保存重开、历史、结构对比、原 PSD 独立对比、IR/资产清单/资产包导出 |
| Web 工作台自动化测试 | 218 项 Vitest 通过（1 项环境变量跳过，含 5 项页面骨架 `pageScaffold.test.ts`）；演示 E2E 与真实引擎/真实 PSD 用例（按环境变量启用）通过；真实 Patchy 隔离切图与真实语料 AI 合并复核 E2E 见下行 |
| 本地资产包（逐层隔离渲染/合成图裁切 + 解码校验 + 文本样式 + ZIP） | 完成；Patchy 隔离渲染 E2E：`Payment1_D` 40 个切图 + 10 个合并素材全部隔离、0 回退、0 失败，透明度样本 31,532/398,682，ZIP 4.3 MB；演示引擎 40 切图/80 输出 + 10 合并素材/20 输出，50/50 校验零误差 |
| Patchy 构建接入 Web 工作台 | **已完成（2026-10-22 重建）**：wasm-core / wasm-release 均重建并 staging；真实引擎编组/合并/撤销/保存前后像素对比 E2E 通过（35.3 s，0 像素差）；逐层隔离切图 E2E 通过（50/50，0 回退） |
| FastAPI + SQLite | 尚未实现 |
| AI 语义命名与合并复核 | 提示词导出 + OpenAI 兼容模型直连 + 严格 JSON 导入 + 人工审核已完成；命名加入计划、合并由人工勾选后经桥接执行；真实 Patchy 合成 PSD 与 Nordic mobile 4 份真实语料回归覆盖执行/撤销/保存重开，保存重开后自动重新分析并导出隔离切图资产包；模型可配置，默认不保存 API Key，不直接修改文档 |

> **门禁说明**：2026-10-22 起 M0 已通过，`artifacts/m0/status.json` 为 `status: passed`、
> `m1Allowed: true`，`acceptanceGates.photoshopWarningFreeOpen` 为 `true`。Windows 侧的
> 浏览器真实引擎 E2E 与 Photoshop 无警告打开均已完成，输出哈希与 macOS 运行一致。
> **已知限制**：本机 Photoshop 的 ExtendScript 子系统损坏（`ScriptingSupport.8li` 命令
> 不可用，`Photoshop.Application` 不进 ROT），因此仓库固化的
> `ci/photoshop-m0-check.ps1` 无法运行；门禁使用 `ci/photoshop-m0-check-actions.ps1`
> （旧版 action automation，对话框保持可见，比原路径更严格地暴露警告），驱动身份记录在
> 证据目录的 `photoshop-open-check-driver.json`。恢复原检查器需要修复/重装 Photoshop。
> 2026-10-20 项目负责人已明确调整开发顺序：**先完成 Web 界面与整体应用，再对接 Photoshop**。

当前进度、限制与待办见 [docs/PROGRESS.md](docs/PROGRESS.md)；完整功能地图与
验收依据见 [docs/FEATURE_MAP.md](docs/FEATURE_MAP.md)；M0 技术报告见
[docs/M0_FEASIBILITY.md](docs/M0_FEASIBILITY.md)；证据路径、构建哈希、复现命令与
入库策略见 [docs/EVIDENCE.md](docs/EVIDENCE.md)；历史方案在
[docs/archive](docs/archive/README.md)。

## 当前可验证的能力

M0 PoC 位于 [`poc/patchy-bridge`](poc/patchy-bridge/README.md)：

- 浏览器把文件交给 Patchy 现有 `__patchyStageBrowserFile`，写入 MEMFS。
- 页面 JS 只向纯 JS 队列追加请求，Patchy 侧由 Qt `QTimer` 轮询，不从 DOM Promise
  直接进入 WASM。
- 协议 v2 白名单：`getState`、`openDocument`、`renderPreview`、`renderLayer`、
  `comparePreview`、`renameLayer`、`groupLayers`、`mergeLayers`、`undo`、
  `saveAsAndReopen`。
- 文档 revision/fingerprint 前置条件、路径白名单、不覆盖已有文件、64 KiB 请求上限、
  单请求互斥、超时与取消。
- 真实 PSD：重命名 → 另存副本 → 关闭重开 → 按新文档 ID 校验层名；before/after PNG
  独立 Chromium 解码后 RGBA SHA-256 完全一致。

## M1 Web 工作台（`apps/web`）

`apps/web` 是 Vue 3 + TypeScript + Vite + Pinia 的本地优先工作台，当前已可完成
“导入 PSD → 一键整理 → 审核建议 → 生成命名计划 → 应用 → 另存并重开 → 历史校验
→ 导出 IR 草稿/资产清单/资产包 ZIP”的完整流程。

### 引擎模式

| 模式 | 入口 | 行为 |
|---|---|---|
| `patchy` | 默认 | 同源 iframe 加载 `/patchy/patchy.html?embedded=100`（或 `VITE_PATCHY_URL`），经协议 v2 白名单执行；要求 COOP/COEP 跨源隔离。`embedded=100` 阻止品牌 shell 按 75% 缩放自嵌套，否则宿主看不到桥接入口 |
| `inspect` | Patchy 不可用时自动回退 | 仅用 ag-psd 只读解析图层树；可编写计划，不能重命名或保存 |
| `demo` | `?engine=demo`（仅开发构建或 `VITE_ENABLE_DEMO=1`） | 内存协议模拟；不生成 PSD，不能作为 Patchy/Photoshop 证据 |

### 一键整理（规则版）

“一键整理”是对当前图层树的确定性规则分析，不调用 AI、不修改文档，结果进入“整理”
面板审核：

- **命名建议**：只依据边界、尺寸、层级与子元素结构推断 UI 组件角色（背景、按钮、
  输入框、表单行、勾选行、角标、角标组、图标按钮、卡片、区块、图片、图标、分隔线），
  再按角色生成 kebab-case 名称；**不读取图层原名，也不读取 T 文案**。同类角色在
  同父级下自动追加 `-2`/`-3` 序号；组件内部图层按父级角色命名为
  `button-background`、`badge-icon` 等。文本层与未识别结构不改名，只进入待复核。
- **结构检查**：空组、单子组、同级重名、通用名称进入“待复核”列表。
- **逻辑编组建议**：对同级、可见、边界相邻或重叠的图层做空间聚类，给出组名与成员；
  满版背景和已完整编组的组不参与。建议写入 Design IR（`logicalGroups` 与节点
  `logicalGroupId`），并按成员边界推断 `layout`（row/column/stack、间距、对齐），
  供 AI 编码工具拆分组件并映射为 flex 布局；连接 Patchy 或演示引擎后可一键写入
  当前文档内存，仍需另存为新 PSD 并重开才持久化。
- **合并候选**：对含 ≥2 个可见子图层、占画布 ≤8% 且元素聚合的组，按结构角色
  判定：角标/角标组生成 `badge-merged`（kind `badge`），按钮、输入框、表单行、
  勾选行、图标按钮、卡片生成对应角色名（kind `component`），建议名不取自图层名或
  文案；输出成员、边界与面积占比。Patchy/演示引擎可一键合并（组内图层栅格化为
  单层），保存并重开后才写入新 PSD；嵌套组不会重复建议。资产包在 Patchy 引擎下
  优先把候选区域逐层隔离渲染为透明背景 PNG，渲染失败时回退为合成图裁切，并写入
  `merged/` 下的单张 1x/2x PNG；它只是前端素材，不代表资产包执行了 PSD 合并。
- **切图候选**：可见的像素/形状/智能对象叶子，以及结构角色为按钮、输入框、
  表单行、勾选行、角标、角标组、图标按钮、卡片的组；排除满版背景、隐藏层、
  剪贴蒙版与文字层，输出 1x/2x 规格。
- **资产清单**：`layerforge.asset-manifest.draft` v0.1.0，包含边界、格式、倍率与
  建议文件名，明确标注 `pixels: "not-generated"`。
- **资产包 ZIP**：`layerforge.asset-pack` v0.4.0。Patchy 引擎下由新增的
  `renderLayer` 桥接操作逐层/逐组隔离渲染：目标图层单独合成到透明背景，输出裁切到
  文档范围内的 1x PNG，再由同一源 iframe 的 MEMFS 读回字节并解码校验尺寸；失败项
  回退为合成图裁切并与源合成区域逐像素比较（容差 ≤2），计数写入
  `comparison.render` 与 `status`。演示引擎没有真实像素，仍从 PSD 扁平合成图裁切。
  两种路径都生成（尺寸允许时）最近邻 2x PNG；同时输出
  `design-ir.json`（Design IR v0.4.0，含带 `layout` 的逻辑编组与切图节点 `assetId`）、
  `agent-context.md`（AI 编码工具上下文，含逻辑编组布局、资产路径表与隔离渲染语义）、
  `page.html`（可直接打开的页面骨架：切图按画布百分比绝对定位，`z-index` 取
  `paintOrder`，逻辑编组输出 `lf-component`+`data-layout-*`，`data-*` 保留语义名、
  图层路径、边界、文本/字体/颜色/对齐，2x 经 `srcset` 提供，未覆盖区域为透明）、
  `preview.html`（原图/重建页面对比）、`comparison.json`、`manifest.json`。合并候选写入
  manifest `mergeCandidates` 与 agent-context 的“合并候选”表，候选区域另存为
  `merged/<建议名>.png`（及 `@2x`），manifest `mergedAssets` 记录成员、边界、
  哈希与校验结果。文本层会提取内容、
  字体、字号、颜色、对齐与粗体标记，写入 IR 节点 `meta` 和 agent-context 的文本表，
  AI 可直接生成真实文本而不是烘焙图片；图层树同时标记剪贴、蒙版、效果与非默认
  混合模式。IR 节点 `zIndex` 与 `paintOrder` 分别记录同级与全局绘制顺序
  （PSD 数组自底向上，0 为最底层；全局序越大越靠上），agent-context 的 `Z`
  列同步显示同级序号，避免 AI 反推层级。字节预算 512 MiB，超限会记录
  `truncated/skipped`，不静默丢弃。

命名建议可以一键加入命名计划，复用现有的“应用 → 保存并重开 → 路径校验”流程。
逻辑编组与合并候选可在可写引擎中直接应用到当前文档内存，随后仍需另存为新 PSD
并重开；编组/合并会同步刷新整理面板，并按图层 ID 纠正尚未应用的命名计划路径。
资产包在 Patchy 引擎下是**逐层隔离渲染**（透明背景、不含父组不透明度/蒙版/剪贴与
画布背景；失败项回退为合成图裁切，并在 manifest 中逐项计数），在演示引擎下是
**合成图裁切**；两者的 2x 都是最近邻放大，不是原生 2x。`merged/` 只是候选区域的
独立渲染或合成裁剪，不是资产包执行了 PSD 合并。保存前后已有整图预览像素对比
（`comparePreview`），但不是 PSD 二进制或 Photoshop 验证。

### AI 语义命名与合并复核（模型直连 / 提示词导出 / 结果导入）

规则无法处理的通用名（`Layer 21`、`Ellipse 8`、`Group 65 copy 7` 等）汇总为 AI 候选；
规则判定的合并候选（面积 ≤ 画布 8%、紧凑、含文本或组件/角标角色）也一并进入任务。
提示词包含项目、画布、图层结构、每个命名候选的路径/父子兄弟名称/边界/文本样例/
布局提示，以及每个合并候选的边界、成员数、成员类型统计与嵌套组数量，**不包含像素**；
请求 schema 为 `layerforge.ai-naming.request` v0.2.0（仍接受 v0.1.0 纯命名响应）。

两种使用方式：

1. **调用模型生成**：在 AI 命名弹窗的「模型配置」中填写 OpenAI 兼容接口，直接请求并
   自动进入审核。调用记录（模型、耗时、tokens、命名/合并/保留数量）写入活动日志，不记录 Key。
2. **下载提示词**：导出 `*-ai-naming-prompt.md` 交给任意 AI 工具，再把返回 JSON 导入。

两种来源都经过同一套严格校验：响应 schema/版本、候选路径成员资格、候选是否已过期、
斜杠/空名/长度/通用名、同级冲突与重复路径。合并复核额外校验：路径属于本次合并候选、
当前仍是图层组、可见带尺寸成员 ≥2 且联合边界与候选一致（防止分析后结构变化）、合并名
不得与同级现有名称或其他命名建议冲突；被合并组内及组下的命名建议会被拒绝。通过项与
需修正项逐条展示：命名勾选后加入命名计划，复用“应用 → 保存并重开 → 路径校验”流程；
合并必须单独勾选并点击执行，经协议 v2 `mergeLayers` 写入引擎内存，可用“撤销上一步”
回退，保存并重开后才写入新 PSD。AI 仍只产出建议，不自动执行。

真实 Patchy 回归（2026-10-22）：从导出的任务 JSON 读取合并候选 → 导入 v0.2.0 决策 →
人工执行 → 撤销恢复原组 → 再次执行 → 保存并重开。合成 PSD 上合并前后与重开后的预览
RGBA SHA-256 完全一致，保存 PSD 独立对比 8→6 节点、合成图 0 差异、逐层 5/5 一致；
证据见 `artifacts/patchy-ai-merge/`。Nordic mobile 4 份真实语料也全部通过：

| 文件 | 节点 | 候选（组/边界/成员） | AI 命名 | 合并差 | 保存重开差 | 逐层可用一致 |
| --- | --- | --- | --- | --- | --- | --- |
| `Payment1_D` | 63→57 | `Selected`/168×133/3 | `ai-merge-10` | 24（0.005%，Δ1） | **0（0.000%，Δ0）** | 41/41 |
| `Payment2_D` | 69→63 | `Selected`/168×133/3 | `ai-merge-10` | 24（0.005%，Δ1） | **0（0.000%，Δ0）** | 46/46 |
| `Detial_D_0708` | 71→69 | `Buy Now`/1118×155/2 | `ai-merge-3` | 3,366（0.704%，Δ1） | **0（0.000%，Δ0）** | 48/48 |
| `Store_D` | 270→245 | `Nav`/1242×250/5 | `ai-merge-4` | 178（0.082%，Δ1） | **0（0.000%，Δ0）** | 99/99 |

撤销步骤在 4 份文件上均为 0 像素差，节点数与预览哈希完全恢复；保存 PSD 中合并层
保留原组路径且为叶子，组内名称全部按子树计数消失，源 SHA-256 不变。形状层光栅
预览写回后，4 份保存重开全部 0 差异（此前 3 份为 0.547%–1.301%，Δ236）。
ag-psd 独立逐层对比中所有可用图层均一致；`Payment1_D`/`Payment2_D`/`Detial`
不再有 unavailable 图层，`Store_D` 仍有 87 个图层因源文件本身没有像素数据
（纯矢量形状）记为 unavailable。证据分别在
`artifacts/patchy-corpus/ai-merge-{payment1-d,payment2-d,detial-d-0708,store-d}/`。
同一用例在保存并重开后自动重新分析保存后的图层树，并直接导出资产包：4 份分别得到
37/42/41/119 个切图与 9/9/5/9 个合并素材，46/51/46/128 个资产使用逐层隔离渲染、
0 个合成回退、0 个解码不一致；AI 合并层本身也作为切图输出（`ai-merge-10`/`-10`/
`-3`/`-4`，1x PNG 尺寸等于保存后的实际层边界）。ZIP 分别为 4.3/4.4/5.0/41.3 MB。
`Detial` 合并层实际边界 1242×321 大于分析候选 1118×155（图层效果外扩），
`Store` 实际边界 1242×248 比候选 1242×250 少 2 px（栅格取整），与候选边界重叠率
分别为 100% 和 99.2%；资产包按保存后的实际边界裁切。
以上均为引擎证据。4 份 AI 合并保存产物已在 Photoshop 27.11 中逐份无警告打开
（4/4 CLEAN，打开前后哈希不变，`artifacts/photoshop-checks/20261022/ai-merge-open-checks.log`）；
该检查只证明可无警告打开，不构成视觉或像素一致性验收。

模型配置项：

| 项目 | 说明 |
| --- | --- |
| 接口地址 | OpenAI 兼容 Base URL，如 `https://api.deepseek.com/v1`；未写 `/chat/completions` 时自动补齐，也可直接填写完整地址 |
| 模型 | 如 `deepseek-chat`、`gpt-4.1-mini`、`qwen2.5:7b`（Ollama）、LM Studio 当前加载的模型名 |
| API Key | 云端服务必填；Ollama / LM Studio 可留空。默认只保留在内存，勾选“记住”后才写入本浏览器 localStorage |
| JSON 模式 | 默认发送 `response_format: { type: "json_object" }`；接口不支持时取消勾选 |
| 预设 | DeepSeek / OpenAI / Ollama / LM Studio 一键填充地址与模型 |

浏览器会直接请求该地址，接口必须允许 CORS；不允许时请使用本地反向代理，不要把 Key
硬编码进代理配置。该功能不替代 FastAPI 代理：需要隐藏 Key、统一审计或服务端限流时仍应
走服务端代理。无论直连还是导入，AI 都只产出命名与合并建议，执行仍由工作台和桥接白名单
完成。真实 7 份 PSD 共产生 387 个 AI 命名候选（单文件 14–136 个）；合并候选由本地规则
给出，合成 PSD 与 Nordic mobile 4 份真实语料上的真实 Patchy AI 合并回归均已通过；
视觉分析、批量自动执行与服务端代理尚未实现。

保存并重开后，工作台会把本次会话打开时（或上次成功保存后）的图层快照与引擎重开
返回的图层树做结构对比：按图层 ID 优先、路径回退匹配，分类统计重命名 / 几何 /
属性 / 新增 / 移除，分类按主变化归类（名称 > 几何 > 属性），完整字段写进
`layerforge.psd-diff` JSON，可在历史面板查看并导出。该对比只覆盖引擎返回的图层树，
不是 PSD 二进制或像素差异。协议 v2 另在保存前后各渲染一张预览 PNG，由 Patchy 内
`comparePreview` 逐像素比较，结果显示在历史面板并写入版本记录；对比对象是预览
PNG，仍不能替代 PSD 二进制校验或 Photoshop 视觉验收。

保存完成后，工作台还会从 Patchy MEMFS 读回刚写出的 PSD（读取后不删除，重开文档
仍可能引用该路径），与 IndexedDB 中的导入源文件一起交给 ag-psd 独立解析，生成
`layerforge.psd-compare` 报告：双方 SHA-256 / 文件大小 / 图层数、按图层树逐项结构
对比、内嵌合成图像素差（容差 2）、差异包围盒，以及逐层像素差。历史面板中的
“原 PSD 独立对比”卡片可查看并导出 JSON，摘要同时写入版本记录。逐层对比按真实图层
ID → 唯一名称+类型+尺寸 → 路径+同类型同尺寸 配对非组图层，只比较尺寸一致的图层
缓存（逐层总量上限 4800 万像素），编组/合并造成的未配对叶层单独计数，不并入逐层
差异。它不依赖引擎返回的图层状态，因此能与“引擎重开后是否一致”分开判断；合成图
或图层缓存缺失时会明确标记不可用。该报告仍不是 Photoshop 渲染或兼容性证据。

### 本地数据

- IndexedDB `layerforge`：`projects`（元数据/计划/版本）、`files`（源 PSD Blob）、
  `snapshots`（本地与版本图层树快照，不含 PSD 二进制）。
- 原始 PSD 不会被覆盖；保存只允许新的 `/saved/*.psd|psb` 路径。
- 命名计划以图层路径为主键做重开校验；路径失效时仅接受唯一新名称匹配并记录说明。

### 常用命令

```sh
cd apps/web
npm install
npm run dev          # http://127.0.0.1:5173
npm run typecheck
npm test             # Vitest
npm run build
npm run test:e2e     # Playwright；浏览器下载不可用时可设 PLAYWRIGHT_CHANNEL=chrome
npm run stage:patchy -- <built-patchy-site>
```

`npm run stage:patchy` 把桥接版 Patchy `wasm-release` 产物复制到
`apps/web/public/patchy`（该目录不入库），并在 staging 时把 `patchy.html` 的
`qtLoad()` 返回值暴露为 `window.__patchyModule`，供资产包从 Emscripten MEMFS 读取
隔离渲染 PNG。

### 已验证

> 2026-10-20 的伊拉克语料记录位于故障磁盘，相关数字保留为历史记录，当前无法复查。
> 2026-10-21 项目负责人提供了新盘 Nordic mobile 语料
> （`B:\迅雷下载\北欧1019\mobile`，4 份 PSD，约 120 MB），已完成真实引擎往返与
> 资产包验证；源文件 SHA-256 前后一致，运行只写新文件。

- `npm run typecheck`、`npm run build` 通过。
- `npm test`：186 项通过、1 项按环境变量跳过（真实 PSD 目录解析）。
- 真实 PSD（Nordic mobile，2026-10-22 重跑）：4 份文件全部完成 Patchy 导入、一键整理、
  编组/合并、另存重开，源 SHA-256 未改变；整理统计（重命名/检查/编组/合并/切图）
  为 Payment1_D `43/3/2/10/40`、Payment2_D `48/3/2/10/45`、Detial_D_0708
  `48/6/4/6/42`、Store_D `139/36/14/10/137`。**保存重开 4/4 为 0 像素差**
  （修复前 Payment1_D 0.712%、Payment2_D 0.844%、Detial_D_0708 0.547%、Δ236；
  `Store_D` 0）；编组/合并差异 ≤0.214%（Δ≤20），来自编辑本身，UI 像素差与独立
  Chromium 解码一致。原样另存对照同样为 0/478,208（Δ0）。Patchy automation state
  的布尔类型标记与 0×0 组边界已归一化，切图/合并/编组分析与本地解析结果一致。
  证据在
  `artifacts/patchy-corpus/{payment1-nordic,payment2-nordic,detail-nordic,store-nordic}/`。
- 真实 PSD 解析（旧伊拉克语料，历史）：`F:\设计稿\伊拉克` 下 7 份文件（227 MiB，
  63–475 节点）全部无警告解析，路径唯一；分组边界由子节点并集推导。AI 命名候选
  共 387 个（14/16/19/41/27/134/136），全部为规则未处理的通用名且未与命名建议重叠。
- 真实 PSD 一键整理（旧伊拉克语料，历史）：7 份文件均通过规则断言（命名路径存在、
  新名称幂等、合并成员存在、切图边界有效）；单文件产生 40–300 条命名建议、
  2–24 组编组建议、6–24 个合并候选、27–250 个切图候选。
- 真实 PSD 资产包（Nordic mobile，2026-10-21，演示引擎）：
  - `Payment1_D.psd`（1242×2718）：40 个切图、80 个输出，另加 10 个合并素材、
    20 个输出；50/50 解码校验通过，最大通道差 0，切片覆盖率 22.7%，ZIP 3.6 MB，
    E2E 14.0 s；产物在 `artifacts/asset-pack/Payment1_D/`。
- 真实 Patchy 隔离切图资产包（Nordic mobile，2026-10-22）：
  - `Payment1_D.psd`（1242×2718）：40 个切图 + 10 个合并素材全部由 Patchy 在 WASM
    内逐层隔离渲染为透明背景 1x PNG，0 合成回退、0 失败；50/50 解码/尺寸校验，
    透明度样本（1242×321）31,532/398,682，覆盖率 34.1%，ZIP 4.3 MB，E2E 37.1 s；
    源文件 SHA-256 不变；产物在 `artifacts/asset-pack-patchy/Payment1_D/`。
  - 隔离渲染不含父组不透明度/蒙版/剪贴与画布背景，@2x 为最近邻放大；该证据证明
    Patchy WASM 内的渲染与 MEMFS 读回链路，不是 Photoshop 验证。
- 页面骨架 `page.html`（2026-10-22）：演示与真实 Patchy 两条资产包 E2E 均断言
  `page.html` 按画布百分比定位 40 个切图、z-index 取 `paintOrder`、逻辑编组输出
  `data-layout-*`、2x 经 `srcset` 提供，并写入 ZIP 与 manifest `files`；Patchy 用例
  37.1 s 通过（50/50 隔离渲染、0 回退、源 SHA 不变）。产物解包后在 Chrome
  1242×2718 实际渲染为 `page-render.png`（同目录）。
- 真实 PSD 资产包（旧伊拉克语料，历史）：
  - `Payment1_D_0708(1).psd`（1242×2718）：27 个切图、54 个输出，另加 9 个合并素材、
    18 个输出；36/36 解码校验通过，最大通道差 0，切片覆盖率 72.7%，ZIP 4.5 MB。
  - `Store_PC_D_0706(1).psd`（3840×3621，475 节点）：250 个切图、500 个输出，另加
    24 个合并素材、48 个输出；274/274 解码校验通过，最大通道差 0，覆盖率 82.9%，
    ZIP 73.2 MB，构建约 35 s。
  - 产物保存在 `artifacts/asset-pack/<psd>/`（ZIP、manifest、comparison、
    agent-context、preview；大型 PNG/ZIP 不入库）。
- Playwright E2E：19 条用例，默认运行 9 条演示引擎用例全部通过，10 条按环境变量
  跳过。演示引擎 9 条覆盖导入 → 重命名 → 计划 → 应用 → 保存重开 → 历史验证与结构
  对比 JSON 导出、IR 草稿导出、一键整理、资产清单、资产包 ZIP 切图与解码校验、
  AI 命名任务导出/模型调用/严格校验、AI 合并复核人工执行与撤销、一键编组 → 合并 →
  保存重开。门控 10 条为真实 Patchy 编组/合并 2 条、真实语料往返 4 条、真实语料
  AI 合并复核 + 保存后资产包 1 条、真实 PSD 资产包 1 条、真实 Patchy 隔离切图资产包
  1 条、保存保真 1 条，分别按 `LAYERFORGE_REAL_PATCHY` / `LAYERFORGE_PSD_DIR`
  启用；语料可用 `LAYERFORGE_CORPUS_CASES` 切换，AI 合并语料可用
  `LAYERFORGE_AI_MERGE_PSD` 切换。保存保真修复后，4 份真实语料往返与 Payment1
  原样另存的保存重开均为 0 像素差；4 份真实语料 AI 合并复核与保存后资产包也已
  重跑通过（2026-10-22）。
- 真实 Patchy 引擎 E2E（2026-10-22 重跑）：合成 PSD 编组/合并/撤销/另存重开与
  保存前后像素对比通过（像素差 0）；Nordic 4 份真实语料完成往返，UI 像素差与独立
  Chromium 解码一致，**4/4 保存重开 0 像素差**；Payment1 原样另存 0/478,208（Δ0），
  结构一致、源文件未被覆盖。修复前 3 份语料与原样另存的 Δ236 差异见 Git 历史。
- 中文项目名会保留在建议的 PSD、IR 与资产清单文件名中。

### 未验证 / 限制

- Patchy WASM 工具链已在本地打通（Qt 6.10.3 + Emscripten 4.0.7）；本轮重建后
  wasm-core 核心测试执行 1299 项、1191 通过、0 失败、108 跳过（可选样本缺失）。
  重建的 `wasm-release` 已 staging，真实引擎编组/合并/撤销/保存前后像素对比通过
  （35.3 s，0 像素差）；期间修复真实引擎把 PSD 组边界报告为 0×0、导致组角色与
  合并候选丢失的问题。2026-10-21 又补齐自动化 state 的 `isText/isShape/isArtboard`
  类型映射，并在归一化时用子层并集补全 0×0 组边界，使 Patchy 路径的切图候选从 0
  恢复到与本地解析一致的 40 个（Payment1_D）。Photoshop 2026 无警告打开已于
  2026-10-22 验证：`m0-normalized.psd`、Nordic 原始与 Patchy 保存输出均无警告打开。
- 演示引擎与本地只读检查都不是 Patchy/Photoshop 证据。
- 真实语料保存重开：Nordic 4 份均为 0 像素差（2026-10-22 修复后），原样另存对照
  同样为 0；修复依赖源文件中的 Photoshop 形状层光栅预览。没有光栅预览、只含矢量块
  的形状层仍会在重开时由 Patchy 重新栅格化，因此不能把该结果推广为“所有 PSD 任意
  编辑后保存都与 Photoshop 像素一致”；Photoshop 无警告打开也不等于像素验收。
- Patchy automation state 只提供 `isGroup/isText/isArtboard/isShape`，不区分智能对象
  与调整层；非文本/形状叶子统一按栅格层参与分析。智能对象仍可作为切图候选，调整层
  的边界可能产生需要人工复核的候选。Patchy 下资产包切图优先逐层隔离渲染，失败项
  才回退为合成图裁切；演示引擎仍只有合成图裁切。
- 规则分析与内置 AI 都不理解设计语义：规则按边界与层级结构猜测组件角色，角色
  名称是建议而非事实，按钮/角标等小尺寸组件可能混淆，必须人工复核；AI 命名看不到
  像素，只能依据结构与文本样例，结果同样必须人工复核后才进入计划。
- 模型直连由浏览器发起，API Key 若勾选“记住”会保存在 localStorage，仅适合个人
  本机使用；接口需允许 CORS。共享环境应改用服务端代理并加访问控制。
- 编组与合并可写入可写引擎的当前文档内存，但必须另存并重开才持久化；逐图层切图
  不写回 PSD。Patchy 资产包为逐层隔离渲染（不含父组不透明度/蒙版/剪贴与画布背景，
  失败项回退合成裁切），演示引擎资产包为合成图裁切（重叠层会被一起截入）；`merged/`
  是独立渲染或合成裁剪，不是 PSD 合并；2x 是最近邻放大，不是原生渲染；它不能替代
  Patchy/Photoshop 的最终视觉验收。
- 保存前后对比包含引擎图层树结构（`layerforge.psd-diff`）、预览 PNG 像素差
  （`comparePreview`）与源/保存 PSD 的独立解析对比（`layerforge.psd-compare`，
  含 SHA-256、内嵌合成图像素差与逐层像素差）；三者都不代表 Photoshop 渲染或
  兼容性验收。独立对比仅在 Patchy 引擎且能找到导入源文件时生成，大画布或逐层
  总量超限时会按像素上限跳过部分像素对比并记录原因；未配对叶层不等于“像素一致”，
  也不做 PSD 二进制逐字节可视化比较。
- 文本提取使用图层基础样式；多段样式只记录 `textRuns` 数量，不展开每段字体与颜色。
- 资产清单（不含像素）仍保留为审核产物；需要像素时导出资产包。
- FastAPI/SQLite 尚未实现；AI 模型直连为浏览器可选功能，不是服务端代理或审计方案。

## 仓库结构

```text
apps/web/               Vue3 工作台（Vite + Pinia + IndexedDB + Playwright E2E）
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

1. **Web UI 与整体应用（初版已完成）**：项目列表、PSD 导入、图层树、属性/重命名、
   命名计划、一键整理、保存重开、历史、IR 与资产清单导出已可用；Patchy 画布双向
   选择仍需 `selectLayer` 桥接扩展。随后接入 FastAPI + SQLite 项目/版本服务。
2. **Photoshop 对接与兼容性验收**：2026-10-22 已完成无警告打开门禁；后续保存
   保真差异仍需逐张视觉复核。
3. **AI 语义命名与合并复核**：提示词导出、OpenAI 兼容模型直连、严格 JSON 导入、
   人工审核与加入命名计划/经桥接执行合并已可用；下一步通过 FastAPI 代理统一鉴权/审计，
   并接入视觉分析与批量执行，仍只输出建议。
4. **编组/安全合并/视觉差异** 与 **Design IR/资产发布**：规则版逻辑编组、合并候选、
    切图候选、资产清单、逐层隔离渲染资产包、保存前后图层树结构对比、预览像素对比
    与源/保存 PSD 独立解析对比已可用；桥接 v2 的 `groupLayers` / `mergeLayers` /
    `undo` / `comparePreview` / `renderLayer` 已在真实 Patchy WASM 实现与回归，
    Photoshop 无警告门禁已通过。原生 2x 渲染、逐层像素差异、PSD 二进制逐字节视图
    与 `selectLayer` 画布联动仍待实现。

在 UI 开发开始前，桥接还需要增加 `selectLayer` 等最小只读/选择操作，以支持图层树与
画布的双向高亮；任何新增操作都必须继续走白名单、前置条件和真实浏览器测试。

## 证据、安全与许可证

- 永远不覆盖原始 PSD；保存只写新的 `/saved/` 路径。
- 桥接不开放任意脚本执行或任意文件路径；请求/响应只经页面纯 JS 队列。
- 无法验证的项一律标记 `unsupported` / `unverified`，不得伪造 Photoshop 结果。
- 大型构建产物、第三方源码、模型和证据媒体不入库；本地证据目录必须新建。
- Patchy 为 MIT；Qt、libheif、ONNX Runtime、模型权重等各自有许可证/NOTICE 要求。
  分发前必须建立 SBOM 并逐项核对，详见 `docs/M0_FEASIBILITY.md` 的许可证章节。
