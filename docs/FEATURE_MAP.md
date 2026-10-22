# 功能地图与待办清单

更新日期：2026-10-23（Asia/Shanghai）

本文是 LayerForgeAI 的能力全景：哪些功能已交付、由什么证据支撑、还有哪些缺口。
当前状态与结论以 [README](../README.md)、[PROGRESS](PROGRESS.md) 为准，证据路径与
复现命令见 [EVIDENCE](EVIDENCE.md)，历史方案见 [archive](archive/README.md)。

## 1. 产品目标与硬边界

目标：在浏览器中上传 PSD，自动分析图层树，用 AI/规则给出语义命名与合并建议，
人工审核后经白名单桥接执行，另存为新 PSD 并重开验证，同时导出切图资产包与
Design IR，供 AI 编码工具还原页面。

硬边界（不随功能迭代改变）：

- 原始 PSD 只读；保存只写新的 `/saved/*.psd|psb`，运行前后源文件 SHA-256 必须一致。
- AI 只输出计划；执行器只能调用协议 v2 白名单操作，不能直接改文档。
- 演示引擎、合成图裁切、模拟保存不得作为 Patchy 或 Photoshop 证据。
- Photoshop 门禁必须串行、单实例、标题校验；只打开临时副本，不关闭非本流程文档。
- 本机 ExtendScript 子系统损坏，Photoshop 检查使用旧版 action automation
  （`ci/photoshop-open-check-actions.ps1`），对话框默认可见。

## 2. 能力矩阵

状态说明：**完成** = 有真实引擎/真实语料证据；**部分** = 可用但有明确限制；
**未开始** = 无实现或仅有设计。

### 2.1 导入、解析与检查

| 能力 | 状态 | 说明与证据 |
|---|---|---|
| PSD/PSB 浏览器导入 | 完成 | 文件经 `__patchyStageBrowserFile` 写入 Patchy MEMFS；真实语料 21–49 MB、最大 270 层 |
| 只读解析回退 | 完成 | Patchy 不可用时自动切 `inspect`（ag-psd），可分析与编写计划，不能写文档 |
| 演示引擎 | 完成 | `?engine=demo` 内存协议模拟；仅流程/格式/几何验证，不作真实引擎证据 |
| 图层树检查 | 完成 | 空组、单子组、同级重名、通用名称进入待复核 |
| 结构角色推断 | 完成 | 仅依据边界、尺寸、层级、子元素结构；不读取图层名与 T 文案 |
| 断点恢复/大响应分块 | 未开始 | 当前只有单请求互斥、超时、取消；崩溃后请求不可恢复 |

### 2.2 一键整理（规则版，不调用 AI）

| 能力 | 状态 | 说明与证据 |
|---|---|---|
| 语义命名建议 | 完成 | 背景、按钮、输入框、表单行、勾选行、角标、角标组、图标按钮、卡片、区块、图片、图标、分隔线；同父级同类追加 `-2`/`-3` |
| 结构检查 | 完成 | 结果进入“待复核”，不改名 |
| 逻辑编组建议 | 完成 | 同级可见、边界相邻/重叠图层空间聚类；写入 `logicalGroups`/`logicalGroupId` 与 `layout`（row/column/stack、间距、对齐） |
| 合并候选 | 完成 | 可见子层 ≥2、面积 ≤8%、元素聚合；角标/组件角色命名；输出成员、边界、面积占比 |
| 切图候选 | 完成 | 可见像素/形状/智能对象叶子 + 组件角色组；排除满版背景、隐藏层、剪贴蒙版、文字层 |
| 资产清单草稿 | 完成 | `layerforge.asset-manifest.draft` v0.1.0，标注 `pixels: "not-generated"` |
| 一键写入引擎内存 | 完成 | 编组/合并经协议 v2 执行；保存并重开后才持久化；支持单步撤销 |
| 结果确定性 | 完成 | 规则不读原名/文案，相同输入可复现；`Payment1_D` 的 Patchy 分析与本机 ag-psd 解析逐项一致（43/3/2/10/40） |

### 2.3 AI 语义命名与合并复核

| 能力 | 状态 | 说明与证据 |
|---|---|---|
| 提示词/任务导出 | 完成 | `layerforge.ai-naming.request` v0.2.0（兼容 v0.1.0），包含结构、边界、文本样例与候选 |
| OpenAI 兼容模型直连 | 完成 | 浏览器直接请求，严格 JSON 校验；API Key 默认不落盘，可选 localStorage；需接口允许 CORS |
| 严格 JSON 导入与校验 | 完成 | 路径、边界、重名、过期候选拒绝；未知字段拒绝 |
| 人工审核与执行 | 完成 | 命名勾选后加入计划；合并需单独勾选并执行，经 `mergeLayers` 写入内存，可撤销 |
| 保存后自动重分析 | 完成 | 保存重开后自动重新分析并导出资产包 |
| 视觉输入 | 未开始 | 模型看不到像素，只能依据结构、名称、边界与文本样例 |
| 批量执行/服务端代理/审计 | 未开始 | 无 FastAPI 代理、统一鉴权、任务队列与审计 |
| 模型评测集 | 未开始 | 无固定样本集与准确率/回归指标 |

### 2.4 执行、保存与验证

| 能力 | 状态 | 说明与证据 |
|---|---|---|
| 重命名 | 完成 | `renameLayer`，真实 PSD 重命名 → 另存 → 重开 → 新文档 ID 校验层名 |
| 编组 | 完成 | `groupLayers`，真实语料 4 份通过；组边界 0×0 已归一化为子层并集 |
| 合并 | 部分 | `mergeLayers` 可执行、可撤销；clipping 边界与复杂组会被引擎拒绝，桥接固定 `withinGroups:false` |
| 撤销 | 完成 | 单步 `undo`；批量操作无事务级回滚 |
| 另存并重开 | 完成 | `saveAsAndReopen`，只写新路径；保存 PSD 可从 MEMFS 回读 |
| 保存保真 | 完成 | `save-fidelity.patch`：带 Photoshop 光栅预览的形状/切片层写回预览；Payment1 原样另存 0/478,208，Nordic 4/4 保存重开 0 像素差 |
| 保存前后像素对比 | 完成 | `comparePreview` 输出差异数、比例、最大通道差与包围盒；仅引擎预览 |
| 结构对比 | 完成 | `layerforge.psd-diff`，ID 优先、路径回退，分类重命名/几何/属性/新增/移除 |
| 原 PSD 独立对比 | 完成 | 保存 PSD 从 MEMFS 回读，ag-psd 独立解析；合成图 + 逐层像素对比（可用层 41/41、46/46、48/48、99/99） |
| PSD 二进制/逐记录对比 | 未开始 | 现有对比不是二进制等价性证明 |
| 纯矢量层通用保真 | 部分 | 无 Photoshop 光栅预览的纯矢量层仍可能被 Patchy 重栅格化，不能承诺任意 PSD |

### 2.5 资产包与页面骨架

| 能力 | 状态 | 说明与证据 |
|---|---|---|
| 逐层/逐组隔离渲染 | 完成 | `renderLayer` 临时文档单独合成、按边界裁切、MEMFS 读回；`Payment1_D` 50/50 隔离、0 回退 |
| 合成图回退 | 完成 | 隔离渲染失败时裁切合成图，并逐像素比较（容差 ≤2），计数写入 manifest |
| 合并候选素材 | 部分 | `merged/` 为候选区域独立渲染（1x + 最近邻 2x），不代表执行了 PSD 合并 |
| 原生 2x | 未开始 | 当前 2x 为最近邻放大，不是原生分辨率渲染 |
| 文本样式提取 | 完成 | 内容、字体、字号、颜色、对齐、粗体写入 IR `meta` 与 agent-context |
| Design IR | 完成 | v0.4.0：逻辑编组、`layout`、`assetId`、`zIndex`/`paintOrder`、剪贴/蒙版/效果/混合模式标记 |
| agent-context.md | 完成 | 逻辑编组布局、资产路径表、文本表、合并候选表、隔离渲染语义 |
| page.html 页面骨架 | 完成 | 百分比绝对定位、`paintOrder` 作为 z-index、`lf-component` + `data-layout-*`、`srcset` 2x、未覆盖区域透明 |
| preview.html/comparison.json | 完成 | 原图/重建页面对比与逐像素统计 |
| ZIP 打包与解码校验 | 完成 | `layerforge.asset-pack` v0.4.0；逐张 PNG 解码校验，0  mismatch |
| 资产包验收转正 | 未开始 | manifest 仍为 `validated:false`；缺 Photoshop/独立解析逐像素对照与原生 2x |
| 响应式页面生成 | 未开始 | 页面骨架为固定画布绝对定位；未推导响应式约束 |
| 父组效果合成 | 未开始 | 隔离渲染不含父组不透明度/蒙版/剪贴与画布背景 |

### 2.6 工作台、引擎与工程化

| 能力 | 状态 | 说明与证据 |
|---|---|---|
| Vue3 工作台 | 完成 | 导入、检查、一键整理、AI 审核、计划、保存重开、历史、结构对比、原 PSD 对比、导出 |
| 项目管理与历史 | 完成 | IndexedDB 项目/revision；应用计划、保存、对比记录；中文项目名文件名保留 |
| 引擎模式切换 | 完成 | `patchy` 默认；`inspect` 自动回退；`demo` 仅开发构建或 `VITE_ENABLE_DEMO=1` |
| 浏览器桥接协议 v2 | 完成 | 白名单：`getState`、`openDocument`、`renderPreview`、`renderLayer`、`comparePreview`、`renameLayer`、`groupLayers`、`mergeLayers`、`undo`、`saveAsAndReopen` |
| 桥接前置条件与限额 | 完成 | revision/fingerprint、路径白名单、不覆盖、64 KiB 请求上限、单请求互斥、超时/取消 |
| 画布 ↔ 图层树高亮 | 未开始 | `selectLayer` 未实现；可见性操作、批量重命名、大响应分块未实现 |
| 自动化测试 | 完成 | 218 项 Vitest 通过（1 项环境跳过）；Playwright 19 条（9 条演示默认运行，10 条门控）；真实语料 6 条 E2E 通过 |
| CI/构建 | 部分 | macOS/Windows 构建脚本与证据校验器完成；Windows 官方构建 lane 未全量跑 |
| 后端持久化 | 未开始 | FastAPI + SQLite（项目、revision、任务、审计）未实现 |
| 大文件/低内存压测 | 部分 | 21–49 MB 语料耗时与 WASM 内存已记录（峰值 184–426 MB）；无低内存对照、无完整 SBOM |
| 崩溃恢复 | 未开始 | tab 崩溃后的请求恢复未实现 |

### 2.7 Photoshop 门禁与证据

| 能力 | 状态 | 说明与证据 |
|---|---|---|
| M0 门禁 | 通过 | `artifacts/m0/status.json`：`passed`、`m1Allowed:true`、协议 v2 |
| Photoshop 无警告打开 | 通过 | Photoshop 27.11：`m0-normalized.psd` CLEAN；Nordic 原始 5/5、保存输出 5/5、AI 合并产物 4/4 CLEAN |
| 独立证据校验 | 完成 | `verify-evidence.mjs`、`verify-browser-evidence.mjs`；`photoshopVerified` 仅由恰好一条 CLEAN 推导 |
| Windows 真实引擎运行 | 完成 | `artifacts/m0/win-20261022-03/`，协议边界 8/8，输出哈希与 macOS 一致 |
| 门禁自动化健壮性 | 部分 | 依赖旧版 action automation；本机 ExtendScript 损坏，原检查器不可用 |

## 3. 未完成待办（按优先级）

### P0：当前无阻塞项

M0 已通过，保存保真与真实语料闭环完成。后续任何重建产物或新增保存输出，都必须
重新跑对应真实 E2E 与 Photoshop 检查后才能更新结论。

### P1：距离最终目标的核心缺口

1. **资产包转正**
   - 原生 2x 渲染（非最近邻放大）。
   - 父组不透明度/蒙版/剪贴与画布背景的合成语义。
   - 以 Photoshop 或独立解析结果做逐像素验收，通过后提升 `validated`。
   - 明确 `merged/` 只是候选素材，不算 PSD 合并证据。
2. **页面生成升级**
   - 真实文本节点（已有样式，需在 `page.html` 输出可选文本而非仅 `data-*`）。
   - 从边界与逻辑编组推导响应式约束（flex/grid、断点、流式尺寸）。
   - 页面骨架与 IR 的布局一致性测试。
3. **AI 能力补齐**
   - 视觉输入（缩略图/局部裁切）与结构化响应校验。
   - 固定评测集、准确率与回归指标。
   - 批量执行仍保持人工审核与白名单桥接。
4. **后端与审计**
   - FastAPI + SQLite：项目、revision、任务、执行审计。
   - 任务状态区分 `interrupted`，不得伪造完成。
5. **桥接 v2 收尾**
   - `selectLayer` 画布 ↔ 图层树双向高亮。
   - 可见性操作、批量重命名、大响应流式/分块。
   - 合并选项评估（`withinGroups`/`keepVectors`/单层栅格化）与失败原因 UI。
   - 批量编组/合并的事务回滚。
6. **对比能力**
   - 逐图层像素差异与 PSD 二进制/逐记录对比。
   - 继续保持独立 Chromium 解码与 ag-psd 校验作为外部证据。

### P2：工程化与收尾

1. Windows 官方构建 lane 全量执行与可复现产物。
2. 低内存机器对照、完整 SBOM、87.7 MB wasm + 77.1 MB data 首屏影响评估。
3. tab 崩溃恢复与大文件内存上限测试。
4. 更多复杂语料：智能对象、蒙版、调整层、纯矢量形状组合。
5. Design IR 校验与发布格式（M5），目前仅草稿导出。
6. 纯矢量层（无 Photoshop 光栅预览）保存保真的通用方案。

## 4. 当前已知限制（不可承诺项）

- 无 Photoshop 光栅预览的纯矢量层仍可能在保存重开时被 Patchy 重栅格化。
- Photoshop 无警告打开不等于像素/视觉一致，也不等于图层完全等价。
- 预览 PNG 像素对比不是 PSD 二进制或 Photoshop 渲染验证。
- 资产包 2x 是最近邻放大；隔离渲染不含父组效果与画布背景；`merged/` 不是 PSD 合并。
- 一键整理不读图层名与 T 文案，按结构角色推断，可能不符合设计意图；合并候选可能
  包含需要保留独立图层的紧凑组，必须人工审核。
- AI 命名看不到像素，响应需人工逐条复核；浏览器直连需要模型接口允许 CORS。
- 结构对比在图层 ID 不稳定且同时增删时可能误配；不能替代 Photoshop 视觉回归。
- 文本提取为基础样式，多段样式只记录 `textRuns` 数量。
- 桥接响应仍为整包 JSON，大图/大计划未分块。

## 5. 证据入口

| 主题 | 路径 |
|---|---|
| 构建身份与哈希 | `artifacts/patchy-release-sha256.txt`、[EVIDENCE §2](EVIDENCE.md#2-构建身份) |
| M0 门禁 | `artifacts/m0/status.json`、`artifacts/m0/win-20261022-03/` |
| 合成 PSD 编组/合并/撤销 | `artifacts/patchy-roundtrip/manifest.json` |
| Nordic 真实语料 | `artifacts/patchy-corpus/{payment1,payment2,detail,store}-nordic/manifest.json` |
| 保存保真 | `artifacts/patchy-corpus/save-fidelity-noop/manifest.json` |
| AI 合并复核 | `artifacts/patchy-corpus/ai-merge-*/manifest.json`、`artifacts/patchy-ai-merge/` |
| 隔离渲染资产包 | `artifacts/asset-pack-patchy/Payment1_D/` |
| Photoshop 检查 | `artifacts/photoshop-checks/20261022/` |
| 复现命令 | [EVIDENCE §3](EVIDENCE.md#3-证据清单) |

## 6. 文档索引

| 文档 | 用途 |
|---|---|
| [README](../README.md) | 项目定位、当前状态、能力概览、快速开始 |
| [PROGRESS](PROGRESS.md) | 详细进度、缺陷修复、未完成清单与风险 |
| [FEATURE_MAP](FEATURE_MAP.md) | 本文：完整功能地图与待办 |
| [EVIDENCE](EVIDENCE.md) | 证据分级、构建身份、复现命令、入库策略 |
| [M0_FEASIBILITY](M0_FEASIBILITY.md) | M0 技术验证报告与门禁历史 |
| [archive](archive/README.md) | 被取代的历史文档 |
