# PSD Normalize Studio Web — 基于 Patchy 的技术实施方案 V1.0

> 目标读者：Codex CLI / 技术负责人。日期：2026-10-20。
> 本文是工程实施设计，不代表已经在本机成功构建 Patchy 或验证浏览器控制 API。

## 0. 目标、边界与先决条件

目标：在浏览器打开 PSD → 展示真实画布和图层 → 一键 AI 分析 → 自动语义命名与逻辑编组建议 → 审核后应用到真实 PSD → 安全合并指定图层 → 视觉差异验证 → 下载 normalized.psd、PNG 资产和 Design IR。

**V1 强制实现**：PSD 打开/预览、图层树采集、页面截图、AI 命名计划、人工审核、批量真实重命名、另存 PSD、重开验证、导出 IR、可观测任务状态。

**V1.1 实现**：自动编组和安全合并、独立资产导出、视觉对比；复杂 PSD 的高保真保留需按能力矩阵降级。

**非目标**：重写完整 Photoshop、在服务端无浏览器情况下任意 PSD 高保真处理、保证所有 PSD 与 Photoshop 100% 像素一致、直接修改原始上传文件、未经确认自动破坏图层。

**第一原则**：Patchy 是 PSD 编辑和渲染引擎；AI 只输出计划；执行器以稳定标识、版本校验、白名单操作、事务和可撤销快照执行。

### 已核对的 Patchy 事实

- 官方仓库：https://github.com/SethRobinson/Patchy
- WASM 文档：https://github.com/SethRobinson/Patchy/blob/main/docs/wasm.md
- 脚本指南：https://github.com/SethRobinson/Patchy/blob/main/scripts/bundled/scripting-guide.md
- API 类型：https://github.com/SethRobinson/Patchy/blob/main/scripts/bundled/patchy.d.ts
- 仓库约定：https://github.com/SethRobinson/Patchy/blob/main/AGENTS.md
- 兼容性约束：https://github.com/SethRobinson/Patchy/blob/main/docs/ps-compat.md
- Patchy 有 WASM 浏览器构建（Qt 6.10.3 + Emscripten 4.0.7，文档所述版本）、内置 JS 脚本、PSD/PSB 图层编辑及保存。
- **外部 Web 宿主调用 Patchy 内部脚本的稳定桥接接口并未在已核对资料中确认存在；必须先通过代码审查和 PoC 建立，不得凭空调用。**
- WASM 多线程需要 Cross-Origin-Opener-Policy: same-origin 与 Cross-Origin-Embedder-Policy: require-corp；跨域资源需遵循隔离策略。
- 官方 WASM 构建说明以 Windows PowerShell/批处理环境为主；Mac Studio 不能直接照抄 Windows 脚本。优先用官方预构建浏览器版做功能验证，若需 Fork 自建 WASM，先做 macOS 构建可行性评估，或使用 Windows CI 构建机。
- 许可证：检查仓库根 LICENSE、vendored 依赖和模型权重各自条款；保留第三方声明；不能只凭项目首页的“开源”认定所有组件可任意商用。

## 1. 总体架构

```text
Vue3 Web Shell / PSD Normalize Studio
  ├─ Project & File Manager
  ├─ Patchy Web Editor (same-origin, modified WASM shell)
  │    └─ Patchy Bridge: browser JS queue ↔ Qt/C++ ↔ scripting/document APIs
  ├─ Original Layer Tree / Semantic Tree / Inspector
  ├─ AI Review & Operation Plan
  └─ Before/After/Diff Visual Validator
              │
              ▼
FastAPI Backend
  ├─ Project / Revision / Task / Audit API
  ├─ PSD Inspector (optional psd-tools fallback)
  ├─ AI Semantic Planner (vision + structural data)
  ├─ Operation Validator (schema, ID, safety, version)
  ├─ Asset/IR Exporter
  └─ SQLite + filesystem artifacts
```

**核心选择**：优先把 Vue3 Shell 和 Patchy WASM 静态资源部署在同源路径，例如 `/studio/` 和 `/patchy/`；不要默认使用跨域 iframe。对于外层 UI 与 Qt WASM canvas 的键盘焦点、拖拽、浏览器下载，需要真实测试。

## 2. 推荐技术栈

| 模块 | 技术 | 说明 |
|---|---|---|
| Web UI | Vue3 + TypeScript + Vite + Pinia | 工作台、审核、任务列表 |
| PSD 编辑 | Patchy C++ / Qt for WASM | Fork，尽量最小侵入 |
| Web 桥接 | TypeScript + C++ Qt QTimer poll queue | 异步命令、事件、二进制输出 |
| Backend | Python 3.12 + FastAPI + Pydantic v2 | AI、项目管理、任务、校验 |
| PSD 辅助解析 | psd-tools + Pillow | 离线读取和辅助索引，不取代 Patchy 渲染 |
| 图像比较 | Pillow + OpenCV + NumPy | 对齐、像素差异、报告 |
| 存储 | SQLite + 本地文件系统 | V1 单机部署；后续对象存储 |
| AI | 可替换多模态 API + 可选本地模型 | 必须支持图像和结构化 JSON 输出 |
| 验证 | Playwright + pytest + Patchy tests | 端到端和兼容性回归 |

## 3. 最关键的 PoC：Patchy Web Bridge（先做，没过不继续）

### 3.1 需要验证的 6 个动作

1. 浏览器中打开真实 PSD（包括 100+ 图层样本）。
2. 从 Patchy 内部导出层级 JSON：层名、稳定身份/路径、父子关系、类型、可见性、坐标、文字、组属性；缺少的字段标注 unsupported。
3. 从 Web Shell 发起 `renameLayer`，Patchy 实际修改指定图层，界面立即显示新名称。
4. 执行 `saveAsPsd`，获得浏览器可下载的文件（或明确的文件句柄/Blob），不得仅返回“已执行”。
5. 重新打开导出 PSD，再次读取图层树，确认名称保存成功。
6. 导出修改前/后的整图 PNG，纯重命名视觉像素相同（容许颜色配置造成的差异必须单独诊断）。

### 3.2 桥接设计（建议新增，非现成 API）

```ts
interface PatchyBridgeRequest {
  requestId: string;
  sessionId: string;
  documentFingerprint: string;
  operation: 'getDocumentInfo'|'listLayers'|'renderPreview'|'renameLayers'|'saveAsPsd'|'exportLayerPng';
  payload: unknown;
}
interface PatchyBridgeResponse {
  requestId: string;
  ok: boolean;
  result?: unknown;
  error?: { code: string; message: string };
  documentRevision: number;
}
```

建议通信机制：页面 JS 将请求写入**纯 JS 队列** → Patchy C++ 在 Qt QTimer 回调中轮询 → 在 Qt 事件上下文中执行 Patchy 文档操作/受限脚本 → 结果写回响应队列 → Vue 通过 Promise 等待完成。此机制参考官方 WASM 文档中的事件循环限制。

**禁止**从普通 DOM Promise 回调直接进入可能启动嵌套事件循环的 WASM C++ 导出函数；官方 `docs/wasm.md` 明确指出会破坏 Asyncify 恢复状态。桥接必须有单请求互斥、超时、取消标记、完成确认、崩溃恢复和大文件分块传输。

**安全**：不能允许前端/AI 任意执行原生脚本或访问任意路径；桥接只暴露操作白名单，后端计划必须经 JSON Schema 和版本校验。

### 3.3 与 Patchy 的集成策略

优先 A：在 Fork 的 Patchy Web shell 和 C++ Qt 应用中增加最小桥接模块，调用已有 document/layer API。

备选 B：如果现有 JS 脚本 API 已足够，C++ 桥接只负责受限脚本派发、结果返回；不要在 Vue 内凭空使用 `app.activeDocument`（它属于 Patchy 内置脚本上下文）。

备选 C：若 WASM 改造成本过高，先用 Patchy 桌面 CLI/headless 跑 AI 操作链作为过渡 PoC，但这**不是 Web 版最终交付**，需明确标记。

## 4. Web UI 信息架构

```text
/studio
  /projects                     项目列表
  /projects/:id/editor          编辑工作台
    左侧：原始图层树 / AI 语义树（切换、双向定位）
    中央：Patchy 实际画布 + 语义区域高亮
    右侧：属性面板（原名/建议名/类型/风险/来源）
    底部：AI 任务、执行日志、告警
  /projects/:id/review          批量命名与合并审核
  /projects/:id/compare         原始/修改后/叠加/差异
  /projects/:id/export          PSD / PNG / IR 下载
```

核心交互：导入 PSD → 生成预览 → 点击「AI 分析」→ 原始/建议双树对比 → 可批量编辑命名 → 勾选确认 → 「应用到 PSD」→ 视觉验证 → 导出。AI 失败不影响手动编辑和保存。

## 5. AI 语义分析工作流

### 5.1 输入（事实层）

- 完整合成图（Patchy 渲染优先）及缩放比例；
- 原始图层树：ID/父级/顺序/类型/bounds/visible bounds/文本/可见性/剪贴/蒙版/混合模式；
- 按区域分块截图和带编号的图层 contact sheet；
- 用户命名规范、`*_s_icon` 等已有业务约定；
- PSD 哈希、当前编辑 revision、图层树指纹。

### 5.2 三段推理

1. 页面理解：整图识别 header/sidebar/content/card/modal/footer 等语义区域，生成区域 bbox。
2. 几何关联：利用图层 bbox、重叠、z-index、父子关系映射候选区域；大背景/阴影/跨区域元素需特殊处理。
3. 局部命名：图层缩略图 + 上下文 + 文本 + 候选区域，输出 `semanticName`、`semanticType`、`confidence`、`evidence`、`groupSuggestion`、`renderAs`。

AI 不直接生成 C++/Patchy 任意代码。输出 Pydantic/JSON Schema 严格校验，未知节点、重复命名、非法字符、冲突图层均拒绝或进入人工审核。

### 5.3 命名规范

- `snake_case`，按页面语义：`page_header`, `product_card`, `product_image`, `product_name`, `product_price`, `add_to_cart_icon`。
- 同一容器下可同名逻辑角色，但输出到 PSD 的实际同级层名需使用稳定后缀或组内路径区分。
- 保留 `originalName` 和原始标识；不可识别使用 `unknown_layer_<id>`，不得臆造。
- 已人工锁定图层 `doNotRename`、`doNotMerge` 不参与自动操作。

## 6. 操作计划与执行

### 6.1 标准 JSON（示意，真实 ID 映射由 Patchy 适配器提供）

```json
{
  "planVersion": "1.0",
  "projectId": "p_001",
  "baseRevision": "r_001",
  "documentFingerprint": "sha256:...",
  "operations": [
    {
      "opId": "op_001",
      "type": "rename_layer",
      "target": {"stableLayerKey": "doc/path-or-engine-id"},
      "expectedName": "图层 25",
      "newName": "product_image",
      "confidence": 0.96,
      "reviewStatus": "approved"
    }
  ]
}
```

**稳定身份问题**：PSD 内部 Layer ID 未必跨导入/保存保持不变。应优先使用 Patchy 可验证的原生 ID；若没有，生成复合定位键（原始路径、顺序、类型、bbox、内容指纹），每次执行前重新解析并校验唯一性；不唯一则停止，不得靠数组下标盲改。

### 6.2 执行状态机

`imported → inspected → analyzed → plan_pending_review → approved → applying → applied → verifying → verified → exported`

异常：`failed`, `rejected`, `rolled_back`, `needs_manual_review`。

- 原始 PSD 永不覆盖。
- 应用前创建 revision 快照（文件哈希、图层树、预览图）。
- 执行操作使用 `opId` 幂等去重，拒绝旧 revision 计划。
- 操作完成后重新读取图层树，不以“命令发送成功”当“保存成功”。
- 保存到 `normalized.psd` 后再次打开验证。

## 7. 自动编组与安全合并

### 7.1 必须区分三种操作

1. `logical_group`：只调整 Design IR 逻辑树，不修改 PSD；V1 可实现。
2. `move_to_group`：真实 PSD 编组/移动；V1.1，需保持图层堆叠、剪贴链、混合上下文。
3. `merge_layers`：真实 PSD 像素合并，可能不可逆；V1.1，必须另存 revision、可撤销和像素验证。

### 7.2 自动合并安全规则

- 默认只允许**相邻且处于同一父组**、无调整层/剪贴蒙版/智能对象/外部混合依赖的普通像素图层作为候选；实际能力由 Patchy API 决定。
- 文字、矢量、智能对象、动态字段、蒙版、特殊混合模式默认锁定；用户可手动覆盖，但仍需警告。
- 先在临时 revision 中合并，比较原图与合并后的**完整页面渲染**；只比较单独图层缩略图不够。
- 差异阈值应可配置；纯重命名要求逐像素一致，合并按像素误差、变化面积和关键区域判定；无可靠渲染则禁止自动验收。
- 提供 `merge_copy`：复制候选组并合并副本，原组隐藏或保留，优先于破坏式合并。
- 无法证明安全的候选保留为 `composite_image` 导出建议，不改真实 PSD。

## 8. 视觉验证

- `original.png`：导入后 Patchy 首次渲染；记录画布尺寸、颜色配置、引擎版本。
- `normalized.png`：应用后同一引擎、同尺寸/色彩配置渲染。
- 对比：MAE、changed pixel ratio、max error、差异热力图、区域 bbox；必要时排除透明 RGB 的不可见差异并比较预乘 Alpha。
- 对比模式：并排、50% 叠加、滑块、差异图。
- 保存后重新打开 `normalized.psd` 并再次渲染，比对导出前后图像和图层树。
- 对复杂效果保留 `unsupported`、`unverified` 状态，不可把渲染差异 0 作为所有 Photoshop 环境都兼容的证明。

## 9. Design IR 输出

```text
release/
  original/source.sha256
  normalized.psd
  release-manifest.json
  source-layers.json
  normalization-plan.json
  design-manifest.json
  previews/original.png
  previews/normalized.png
  previews/diff.png
  assets/*.png
  reports/validation.json
  reports/operations.json
```

`design-manifest.json` 节点必须包含 `id,parentId,sourceLayerKeys,semanticName,semanticType,bounds,renderAs,assetId,dynamic,confidence,reviewStatus`。每个资产记录路径、SHA256、像素尺寸、原始层来源和导出范围。校验唯一 ID、无循环父子关系、资产存在、hash 匹配、审核绑定 revision。**IR 和 PSD 两者都应导出，但 IR 不以 PSD 真实编组完成为前提。**

## 10. 后端 API 设计

| 方法 | 路径 | 用途 |
|---|---|---|
| POST | `/api/v1/projects` | 创建项目 |
| POST | `/api/v1/projects/{id}/uploads` | 上传 PSD（限制大小和类型） |
| GET | `/api/v1/projects/{id}/revisions` | 版本列表 |
| POST | `/api/v1/projects/{id}/inspect` | 提取图层和预览 |
| GET | `/api/v1/projects/{id}/layers` | 获取原始层树 |
| POST | `/api/v1/projects/{id}/analyze` | 发起 AI 分析 |
| GET | `/api/v1/projects/{id}/plans/{planId}` | 获取 AI 计划 |
| PUT | `/api/v1/projects/{id}/plans/{planId}` | 修改计划 |
| POST | `/api/v1/projects/{id}/plans/{planId}/approve` | 审核确认 |
| POST | `/api/v1/projects/{id}/apply` | 创建执行任务，浏览器 Patchy 执行 |
| POST | `/api/v1/projects/{id}/verify` | 图层与像素验收 |
| POST | `/api/v1/projects/{id}/export` | 打包产物 |
| GET | `/api/v1/tasks/{taskId}` | 状态与错误 |

V1 应区分后端 AI 任务和浏览器内 Patchy 执行任务。浏览器关闭、WASM 崩溃时任务必须标记 `interrupted`，不能伪称完成；重新进入需从上一次成功保存的 revision 恢复。

## 11. 数据库与目录

SQLite 表：`projects`, `documents`, `revisions`, `layer_snapshots`, `analysis_jobs`, `plans`, `plan_operations`, `reviews`, `execution_jobs`, `artifacts`, `audit_logs`。

```text
psd-normalize-studio/
  apps/web/                         # Vue3 shell
  services/api/                    # FastAPI
  packages/contracts/              # TS/Pydantic JSON schemas
  packages/patchy-bridge/          # Web TS SDK
  vendor/Patchy/                   # Git submodule 或受控 fork
  patches/patchy/                  # 补丁/变更说明
  tests/fixtures/                  # 小型可公开 PSD 样本
  tests/e2e/                       # Playwright
  workspace/projects/<projectId>/
    original/source.psd
    revisions/<revisionId>/
      source-layers.json
      plan.json
      normalized.psd
      previews/
      assets/
      reports/
```

## 12. 部署和安全

- 单机本地优先：`http://localhost` 开发；正式环境 HTTPS，同源提供 `/studio`、`/patchy`、`/api`。
- Nginx/开发代理对 Patchy WASM 路由提供 `Cross-Origin-Opener-Policy: same-origin` 与 `Cross-Origin-Embedder-Policy: require-corp`；验证 `crossOriginIsolated === true`。第三方资源跨域策略需符合 COEP。
- PSD 可能包含敏感业务设计，默认本地处理；只有用户明确选择云端模型时上传必要截图/结构数据，提示传输范围；可选本地视觉模型。
- 文件上传限制体积、扩展名、签名、图层数量、尺寸、处理时间；阻止路径穿越、ZIP bomb、超大内存占用；不执行来自 PSD 或 AI 的任意代码。
- API 令牌仅存在于受控后端；不要注入 WASM 或公开前端。
- 浏览器 WASM 受 wasm32 内存和浏览器限制；为大 PSD 提供明确失败和桌面降级策略。

## 13. 开发阶段与验收

### M0：Patchy 可行性门禁（最高优先级）

- clone Patchy，阅读 `AGENTS.md`、`docs/wasm.md`、`scripting-guide.md`、`patchy.d.ts`。
- 验证现有浏览器构建，确定 fork 编译路线（macOS 可行则 macOS；否则 Windows CI）。
- 建立浏览器 ↔ Patchy 最小通信桥。
- 用真实 PSD 读取图层树、重命名 1 层、另存、重开验证、比较 PNG。
- **未通过 M0 不允许进入完整 UI/AI 开发**；产出 `docs/M0_FEASIBILITY.md`、日志和截图。

### M1：Web 工作台

- Vue3 页面集成 Patchy，导入 PSD、图层树、节点双向高亮、属性编辑。
- 验收：100+ 图层浏览、图层选择稳定、PSD 保存重开成功。

### M2：AI 语义命名

- 全图/区域截图、层结构采集、模型适配器、JSON 计划、人工审核。
- 验收：指定真实样本能输出可审核建议；无 ID 错配；命名不改变像素。

### M3：批量执行与版本化

- 计划验证、批量重命名、Undo/Redo、版本快照、导出 PSD。
- 验收：100 个图层命名、重复执行幂等、保存重开图层名一致。

### M4：编组、合并、视觉差异

- 先逻辑分组，再真实编组，最后安全合并；保留降级策略。
- 验收：简单 PSD 合并可验证；复杂场景明确拒绝或人工审核，绝不静默破坏。

### M5：Design IR / 资产发布

- 导出 schema 规范 IR、PNG、报告和 release zip；由下游 Vue Skill 消费。
- 验收：交叉引用与哈希检查通过，至少 3 个不同类型 PSD 样本回归。

## 14. Codex 任务拆分

| 任务 | 主要输出 | 前置 |
|---|---|---|
| T01 | Patchy 源码/API/许可证审计报告 | 无 |
| T02 | Patchy WASM 启动及本机/CI 构建方案 | T01 |
| T03 | PatchyBridge 最小双向协议与 C++/JS 实现 | T02 |
| T04 | 图层读取/重命名/保存/重开端到端测试 | T03 |
| T05 | Vue3 Web Shell 与画布集成 | T04 |
| T06 | FastAPI + SQLite 项目/版本服务 | T04 |
| T07 | AI 视觉语义分析与 Pydantic 校验 | T05,T06 |
| T08 | 审核与批量应用 | T07 |
| T09 | 安全合并/对比 | T08 |
| T10 | IR/资产包与 E2E 验收 | T09 |

## 15. 直接交给 Codex 的启动提示词

```text
你是该项目的技术实施负责人。阅读本文件后，先执行 M0，不要直接写整个应用。

1. Clone https://github.com/SethRobinson/Patchy，固定 commit，阅读 AGENTS.md、docs/wasm.md、scripts/bundled/scripting-guide.md、scripts/bundled/patchy.d.ts、LICENSE、docs/ps-compat.md。
2. 用源码搜索确认 WebAssembly 浏览器构建、图层遍历、图层重命名、PSD 保存/下载、JS 脚本执行的真实入口；把“已存在”和“需要新增”的 API 严格分开，不能猜测接口。
3. 验证在当前 macOS 环境能否构建 WASM；如果官方构建脚本只支持 Windows，记录阻塞和可行的 Windows CI 方案。不要未经验证宣称已构建成功。
4. 做最小浏览器桥接 PoC：Vue/JS 发送读取图层请求 → Patchy 返回 JSON → 指定图层重命名 → 另存 PSD → 重新打开并校验 → 导出 before/after PNG。
5. 注意 docs/wasm.md 的 Asyncify/Qt 事件循环警告，禁止从 DOM Promise 回调直接进入可能嵌套事件循环的 C++ 导出函数。优先 JS 队列 + Qt QTimer 轮询。
6. 产出 docs/M0_FEASIBILITY.md、可复现运行命令、代码路径、截图、测试日志、阻塞列表、下一阶段建议。未通过 M0 不推进 M1。
7. 禁止覆盖原 PSD、禁止 rm -rf/git reset --hard 等破坏性命令、禁止虚构测试结果。所有第三方代码和模型依赖检查许可证。

目标是 Patchy Fork + Vue3 + FastAPI 的 PSD Normalize Studio Web，而不是重写 PSD 编辑器。
```

## 16. 参考来源（官方）

- https://github.com/SethRobinson/Patchy
- https://github.com/SethRobinson/Patchy/blob/main/docs/wasm.md
- https://github.com/SethRobinson/Patchy/blob/main/scripts/bundled/scripting-guide.md
- https://github.com/SethRobinson/Patchy/blob/main/scripts/bundled/patchy.d.ts
- https://github.com/SethRobinson/Patchy/blob/main/AGENTS.md
- https://github.com/SethRobinson/Patchy/blob/main/docs/ps-compat.md
- https://github.com/SethRobinson/Patchy/blob/main/RELEASE-HISTORY.md
