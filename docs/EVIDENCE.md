# 证据索引与复现

更新日期：2026-10-22（Asia/Shanghai）

本文是仓库内可复查证据的入口。结论与限制见 [PROGRESS.md](PROGRESS.md) 和
[README](../README.md)；这里只回答“哪条结论由哪份证据支持、如何重跑、哪些文件不入库”。

## 1. 证据分级

| 级别 | 含义 | 可以证明 | 不能证明 |
| --- | --- | --- | --- |
| Photoshop 门禁 | 真实 Photoshop 以默认（可见）对话框打开文件并记录 CLEAN | 文件能被该版本 Photoshop 无警告打开、打开前后文件未变 | 像素/视觉一致、图层完全等价 |
| Patchy WASM 引擎 | 浏览器内真实 `wasm-release` + 协议 v2 白名单操作 | 引擎内的导入、整理、编组/合并、撤销、另存、重开与渲染行为 | Photoshop 兼容性；不等于 Photoshop 渲染结果 |
| 独立解析 | ag-psd 解析保存 PSD、Chromium 独立解码预览 PNG | 结构/图层像素/文件哈希层面的独立核对 | Photoshop 实际显示效果 |
| 演示引擎 | `?engine=demo` 的内存协议模拟或合成图裁切 | UI 流程、数据格式与切片几何 | 真实 Patchy 渲染、真实 PSD 保存、Photoshop 证据 |

**硬规则**

- 原始 PSD 只读：保存只写新的 `/saved/*.psd|psb` 路径；每次真实语料运行前后记录
  源文件 SHA-256，必须一致。
- 演示引擎、合成图裁切、模拟保存不得作为 Patchy 或 Photoshop 证据。
- 预览 PNG 的像素对比不是 PSD 二进制或 Photoshop 渲染验证。
- 证据 manifest 中的 `photoshopVerified` / `m0Accepted` 不得由引擎运行自行置为 true。

## 2. 构建身份

| 项目 | 值 |
| --- | --- |
| Patchy 固定提交 | `d1ff95235e00af296868d4253e03391ca002ee9d` |
| 桥接协议 | v2（含 `renderLayer`、`undo`、`comparePreview`、`saveAsAndReopen`） |
| wasm-release 构建时间 | 2026-10-22 17:24（Asia/Shanghai） |
| `patchy.js` | 428,209 B，SHA-256 `005611923f72a843af8f78dbf3bc754258d5506554905850b707a23720fa783c` |
| `patchy.wasm` | 87,799,621 B，SHA-256 `b0b67979540230f0c7099cc2ca3e620b6bb42cb32445d64909c5382d8a9480bb` |
| `patchy.data` | 77,138,414 B，SHA-256 `fab99b8e4b12de603ac8f31c2cfcbbcff4ca1af0146ce0d33ae64816ffe78e36` |

哈希记录在 `artifacts/patchy-release-sha256.txt`。构建与 staging：

```bat
vendor\Patchy\scripts\release\build-wasm.bat
node apps\web\scripts\stage-patchy.mjs vendor\Patchy\build\package\wasm-site
```

staging 额外把 shell 的 `qtLoad()` 返回值暴露为 `window.__patchyModule`，资产包通过它
读取 Emscripten MEMFS 中的隔离渲染 PNG。`apps/web/public/patchy/` 是本地 staging
产物，体积大，不入库。

**外壳缩放约束**：Patchy 品牌 shell 默认 GUI 缩放 75%，此时它会把引擎再嵌入一层
iframe，宿主页面看不到 `__patchyStageBrowserFile`。宿主 iframe 地址必须带
`embedded=100`（`iframeTransport.ts` 的 `patchyIframeUrl()`），引擎才在宿主 iframe
内启动。2026-10-22 的保存保真 E2E 曾因缺该参数回退到本地只读检查并超时。

## 3. 证据清单

### 3.1 M0（macOS + Windows 门禁）

| 证据 | 路径 | 结论 |
| --- | --- | --- |
| 里程碑状态 | `artifacts/m0/status.json` | `status: passed`、`m1Allowed: true`、`protocolVersion: 2` |
| Windows 浏览器真实引擎运行 | `artifacts/m0/win-20261022-03/` | 真实 PSD 打开/重命名/保存/重开、8/8 协议边界、输出哈希与 macOS 一致 |
| Windows 构建与校验日志 | `artifacts/m0/win-20261022-03/{manifest.json,evidence-verification.json,browser-evidence-verification.json}` | 独立证据校验通过；`photoshop-open-check.log` 有且仅有一条 CLEAN |
| macOS 构建/核心测试 | `artifacts/m0/logs/` | wasm-core 1299 项执行、0 失败；wasm-release 含桥接 |
| 协议与桥接说明 | `poc/patchy-bridge/PROTOCOL.md`、`poc/patchy-bridge/README.md` | v2 白名单、前置条件、错误码、撤销语义 |

复核：

```sh
M0_ARTIFACT_DIR=artifacts/m0/win-20261022-03 node poc/patchy-bridge/scripts/verify-evidence.mjs
M0_ARTIFACT_DIR=artifacts/m0/win-20261022-03 node poc/patchy-bridge/scripts/verify-browser-evidence.mjs
```

### 3.2 合成 PSD 的编组/合并/撤销/保存重开

证据：`artifacts/patchy-roundtrip/manifest.json`（fixture SHA-256
`82b74a93c66bb4a19d52c48e2701560ee9efe9fd8464807a606e00fcce7525f3`）。

- before / grouped / merged / reopened 四张预览 RGBA SHA-256 完全一致；
- UI 保存前后像素差 0/16,000（0.000%）；
- 保存 PSD 中 `row-cluster` 含 4 个子层、`icon-button-merged` 无子层、原 `badge` 组不存在；
- ag-psd 独立逐层对比 5/5 一致；
- 源 fixture 哈希不变。

```sh
cd apps/web
LAYERFORGE_REAL_PATCHY=1 PLAYWRIGHT_CHANNEL=chrome npx playwright test e2e/patchy-group-merge.spec.ts
```

### 3.3 Nordic mobile 真实语料

语料：`B:\迅雷下载\北欧1019\mobile`（只读，4 份 PSD，21–49 MB）。源文件 SHA-256
见 `artifacts/patchy-corpus/source-sha256-nordic-mobile.txt`。

每份文件执行：导入 → 一键整理 → 应用首个编组 → 应用首个合并 → 另存并重开 →
独立解码预览 PNG 比对；AI 合并用例另做提示词导出/决策导入/执行/撤销/再次执行/
保存重开 → 重新分析并导出资产包。

| 文件 | 编组差 | 合并差 | 保存重开差（vs 保存前最后预览） | 源文件 | 证据 |
| --- | --- | --- | --- | --- | --- |
| `Payment1_D.psd` | 1,024（0.214%，Δ20） | 3,047（0.637%，Δ1） | **0（0.000%，Δ0）** | 未变 | `artifacts/patchy-corpus/payment1-nordic/manifest.json` |
| `Payment2_D.psd` | 1,024（0.214%，Δ20） | 3,039（0.635%，Δ1） | **0（0.000%，Δ0）** | 未变 | `artifacts/patchy-corpus/payment2-nordic/manifest.json` |
| `Detial_D_0708.psd` | 0（0.000%，Δ0） | 3,366（0.704%，Δ1） | **0（0.000%，Δ0）** | 未变 | `artifacts/patchy-corpus/detail-nordic/manifest.json` |
| `Store_D.psd` | 0（0.000%，Δ0） | 0（0.000%，Δ0） | **0（0.000%，Δ0）** | 未变 | `artifacts/patchy-corpus/store-nordic/manifest.json` |

编组/合并的差异来自编辑本身（栅格化/抗锯齿），不是保存缺陷；保存重开差为 0 表示
另存并重开后的合成预览与保存前最后一次编辑预览逐像素一致。

```sh
cd apps/web
LAYERFORGE_REAL_PATCHY=1 LAYERFORGE_PSD_DIR='B:\迅雷下载\北欧1019\mobile' \
  PLAYWRIGHT_CHANNEL=chrome npx playwright test e2e/patchy-real-corpus.spec.ts
```

说明：每份文件都会把 `saved.psd`、预览 PNG 和新 manifest 写入对应证据目录；大型
PSD/PNG 按 `.gitignore` 留在本地，manifest、console 日志与文本报告入库。

### 3.4 保存保真（原样另存）

证据：`artifacts/patchy-corpus/save-fidelity-noop/manifest.json`。

- 输入：`Payment1_D.psd`（SHA-256 `5b5ad045039e373caa644e59b7b790692b7505369e86098ec5ede2de8037a819`）；
- 不编辑，直接另存并重开；
- 渲染确定性：同一状态连续两次预览 0 差异；
- 保存重开：**0/478,208 像素差（Δ0）**；
- 根图层名称与顺序一致，源文件 SHA-256 不变；保存 PSD 从 21.4 MB 增至 22.1 MB，
  因为形状层写回了光栅预览。

```sh
cd apps/web
LAYERFORGE_REAL_PATCHY=1 LAYERFORGE_PSD_DIR='B:\迅雷下载\北欧1019\mobile' \
  PLAYWRIGHT_CHANNEL=chrome npx playwright test e2e/patchy-real-corpus.spec.ts -g '保存保真'
```

修复内容见 `poc/patchy-bridge/patchy/save-fidelity.patch`：RGB 另存时若导入的 Photoshop
形状层带有可见光栅预览，则写回预览而不是空通道；Patchy 自己栅格化的形状仍保留空通道
约定；原生色彩模式保存保持 Photoshop 的空通道约定。核心回归测试
`psd_photoshop_raster_shape_pixels_survive_save` 随 patch 提供。

### 3.5 AI 语义命名与合并复核

| 证据 | 路径 | 结论 |
| --- | --- | --- |
| 合成 PSD 回归 | `artifacts/patchy-ai-merge/manifest.json` | 任务导出 → 决策导入 → 人工执行 → 撤销 → 再执行 → 保存重开；预览哈希一致，独立对比 8→6 节点、合成图 0 差异、逐层 5/5 |
| Nordic 4 份回归 | `artifacts/patchy-corpus/ai-merge-{payment1-d,payment2-d,detial-d-0708,store-d}/manifest.json` | 节点数 63→57、69→63、71→69、270→245；撤销与保存重开均 0 像素差；逐层对比 41/41、46/46、48/48、99/99；资产包 37/42/41/119 切图、9/9/5/9 合并素材、0 回退 |
| 模型直连测试 | `apps/web/src/lib/aiNamingClient.test.ts` | OpenAI 兼容请求、严格 JSON 校验、Key 默认不落盘 |
| 浏览器 E2E | `apps/web/e2e/ai-naming-flow.spec.ts` | 演示引擎覆盖任务导出、模型调用、审核与合并撤销 |

### 3.6 资产包

| 证据 | 路径 | 结论 |
| --- | --- | --- |
| 真实 Patchy 隔离渲染 | `artifacts/asset-pack-patchy/Payment1_D/`（`run.json`、`manifest.json`） | 40 个切图 + 10 个合并素材全部隔离渲染，0 合成回退、0 失败；ZIP 4.3 MB；源 SHA 不变 |
| 演示引擎合成裁切 | `artifacts/asset-pack/Payment1_D/` | 40 切图 + 10 合并素材、50/50 解码校验零误差；仅作格式与几何验证 |
| 保存后资产包（AI 合并语料） | `artifacts/patchy-corpus/ai-merge-*/manifest.json` 的 `assetPack` | 4 份分别 37/42/41/119 个切图、9/9/5/9 个合并素材，隔离渲染 46/51/46/128、0 回退、0 解码不一致 |
| 页面骨架 | 资产包 ZIP 内 `page.html`、`artifacts/asset-pack-patchy/Payment1_D/page-render.png` | 切图按画布百分比定位、z-index 取 paintOrder、逻辑编组输出 `data-layout-*`、2x 经 `srcset` |

```sh
cd apps/web
npx playwright test e2e/asset-pack-real.spec.ts
LAYERFORGE_REAL_PATCHY=1 LAYERFORGE_PSD_DIR='B:\迅雷下载\北欧1019\mobile' \
  PLAYWRIGHT_CHANNEL=chrome npx playwright test e2e/asset-pack-patchy.spec.ts
```

限制：隔离渲染只含目标图层自身，不含父组不透明度/蒙版/剪贴与画布背景；2x 是最近邻
放大，不是原生 2x；`merged/` 是候选区域的独立渲染，不代表资产包执行了 PSD 合并。

### 3.7 Photoshop 无警告打开

驱动：`ci/photoshop-open-check-actions.ps1`（旧版 action automation，对话框保持可见；
本机 ExtendScript 子系统损坏，固化的 `ci/photoshop-m0-check.ps1` 无法运行）。

| 证据 | 路径 | 结论 |
| --- | --- | --- |
| M0 输出 | `artifacts/m0/win-20261022-03/photoshop-open-check.log` | `m0-normalized.psd` CLEAN，且仅一条 CLEAN |
| 语料原件与保存输出 | `artifacts/photoshop-checks/20261022/open-checks.log` | Nordic 原件 5/5 CLEAN；17:24 构建的 4 份保存输出 + Payment1 原样另存 5/5 CLEAN（18:51 复查，哈希未变） |
| AI 合并产物 | `artifacts/photoshop-checks/20261022/ai-merge-open-checks.log`、`ai-merge-open-check-driver.json` | 4/4 CLEAN，输入 SHA-256 与打开后哈希记录在 driver JSON（19:05 复查） |
| 语料复查驱动 | 同目录 `corpus-open-check-driver.json` | 每个输入的源证据路径、临时副本、SHA-256 与 CLEAN 结论 |
| 驱动身份 | 同目录 `photoshop-open-check-driver.json` | Photoshop 27.11、串行、单实例、对话框默认可见 |
| 历史记录 | 同目录 `open-checks-20261022-0914.log` | 修复前保存输出的旧检查记录，不代表当前产物 |

该检查只证明无警告打开；不代表像素/视觉一致，也不代表形状/切片层的保存保真已通过。

## 4. 文件与提交策略

- 入库：manifest/JSON、console 日志、HTML/Markdown 报告、补丁、脚本、哈希清单。
- 不入库：`*.psd`、`*.png`、`*.zip`、trace、`unpacked/`、`vendor/`、`dist/`、
  `apps/web/public/patchy*/`、`test-results/`、`.recovery/`（见 `.gitignore`）。
- 证据目录中的 manifest 必须能对应到具体构建身份与源文件哈希；重建 wasm 或重跑语料
  后，旧 manifest 不再代表当前产物。
- 当前文档状态与历史方案见 [PROGRESS.md](PROGRESS.md) 和
  [archive/README.md](archive/README.md)。
