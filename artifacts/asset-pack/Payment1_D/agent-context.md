# real-Payment1_D · AI 编码上下文

> 由 LayerForgeAI 从 PSD 本地解析生成。切图来自扁平合成图裁切；这不是 Patchy/Photoshop 验证结果。

## 文件

- `design-ir.json`：机器可读图层树、边界、语义名、文本内容/样式、命名计划、含布局提示的逻辑编组、切图节点 `assetId` 与全局绘制序 `paintOrder`。
- `manifest.json`：资产、输出文件、哈希与对比统计。
- `page.html`：可直接打开的页面骨架；按画布百分比绝对定位切图，`data-component-*`/`data-layout-*` 标记逻辑编组与布局提示，`data-*` 属性保留语义名、图层路径、文本与样式，适合 AI 在此基础上改写成组件化页面。
- `preview.html`：原始合成图与资产重建的并排预览。
- `assets/`：PNG 切图（1x 与 @2x）。
- `merged/`：合并候选区域的单张合成裁剪 PNG（1x 与 @2x），可直接作为前端素材，不代表 PSD 已合并。

## 页面

- 项目：real-Payment1_D
- 源文件：Payment1_D.psd
- 画布：1242×2718
- 引擎：demo（本地资产包不代表引擎能力）
- 资产数量：40
- 像素来源：逐层隔离渲染 0 个切图 / 0 个合并素材，合成图裁切 40 个切图 / 10 个合并素材
- 切图覆盖率：22.7%（按面积）

## 图层结构

列表按 PSD 堆叠顺序排列（自底向上，`z` 为同级序号，0 是最底层；数值越大越靠上）。

- 2 (/0) — z=0 · 智能对象 · 1242×5540 @ 0,0 · 可见 · 100%
- Layer 1 (/1) — z=1 · 像素 · 1242×2718 @ 0,0 · 可见 · 80%
- Rectangle 5 copy 4 (/2) — z=2 · 形状 · 1244×1967 @ -1,752 · 可见 · 100% · 逻辑组=card
- Pay Now (/3) — z=3 · 组 · 1118×155 @ 62,2277 · 可见 · 100%
  - Rectangle 16 copy 2 (/3/0) — z=0 · 形状 · 1118×155 @ 62,2277 · 可见 · 100% · 效果
  - Pay Now (/3/1) — z=1 · 文本 · 208×46 @ 519,2334 · 可见 · 100%
- agree (/4) — z=4 · 组 · 1064×50 @ 64,2476 · 可见 · 100%
  - Rectangle 18 (/4/0) — z=0 · 形状 · 50×50 @ 64,2476 · 可见 · 100%
  - I have readed and agree Membership Service Agreement (/4/1) — z=1 · 文本 · 1001×37 @ 127,2487 · 可见 · 100%
- 25,000 (/5) — z=5 · 文本 · 294×85 @ 885,2161 · 可见 · 100% · 逻辑组=card
- 28,000 (/6) — z=6 · 文本 · 166×39 @ 1011,2094 · 可见 · 100% · 逻辑组=card
- Total Cost IQD (/7) — z=7 · 文本 · 289×34 @ 64,2197 · 可见 · 100% · 逻辑组=card
- Promo Code (/8) — z=8 · 组 · 1122×131 @ 58,1812 · 可见 · 100%
  - Rectangle 1 copy 12 (/8/0) — z=0 · 形状 · 837×131 @ 58,1812 · 可见 · 100%
  - Promo Code Here (/8/1) — z=1 · 文本 · 314×29 @ 107,1863 · 可见 · 100%
  - Rectangle 1 copy 13 (/8/2) — z=2 · 形状 · 239×131 @ 941,1812 · 可见 · 100% · 效果
  - Verify (/8/3) — z=3 · 文本 · 113×39 @ 1004,1861 · 可见 · 100%
- Payment Method (/9) — z=9 · 组 · 1122×572 @ 58,1165 · 可见 · 100%
  - Payment Method (/9/0) — z=0 · 文本 · 295×36 @ 62,1169 · 可见 · 100%
  - (Visa & Mastercard accepted) (/9/1) — z=1 · 文本 · 526×40 @ 400,1165 · 可见 · 100%
  - 1 (/9/2) — z=2 · 组 · 528×143 @ 58,1245 · 可见 · 100%
    - Rectangle 1 copy 11 (/9/2/0) — z=0 · 形状 · 528×143 @ 58,1245 · 可见 · 100%
    - -s-AsiaPay (/9/2/1) — z=1 · 组 · 95×95 @ 106,1272 · 可见 · 100%
      - -slice- (/9/2/1/0) — z=0 · 形状 · 95×95 @ 106,1272 · 可见 · 100%
      - AsiaPay (/9/2/1/1) — z=1 · 像素 · 89×89 @ 109,1275 · 可见 · 100%
    - Asia Pay (/9/2/2) — z=2 · 文本 · 174×40 @ 245,1301 · 可见 · 100%
  - 2 (/9/3) — z=3 · 组 · 528×143 @ 652,1245 · 可见 · 100%
    - Rectangle 1 copy 11 (/9/3/0) — z=0 · 形状 · 528×143 @ 652,1245 · 可见 · 100%
    - -s-QICard (/9/3/1) — z=1 · 组 · 95×95 @ 698,1272 · 可见 · 100%
      - -slice- (/9/3/1/0) — z=0 · 形状 · 95×95 @ 698,1272 · 可见 · 100%
      - QICard (/9/3/1/1) — z=1 · 像素 · 89×89 @ 701,1275 · 可见 · 100%
    - QI Card (/9/3/2) — z=2 · 文本 · 150×35 @ 839,1301 · 可见 · 100%
  - 3 (/9/4) — z=4 · 组 · 528×143 @ 58,1419 · 可见 · 100%
    - Rectangle 1 copy 11 (/9/4/0) — z=0 · 形状 · 528×143 @ 58,1419 · 可见 · 100% · 效果
    - -s-ZainCash (/9/4/1) — z=1 · 组 · 95×95 @ 105,1446 · 可见 · 100%
      - -slice- (/9/4/1/0) — z=0 · 形状 · 95×95 @ 105,1446 · 可见 · 100%
      - ZainCash (/9/4/1/1) — z=1 · 像素 · 90×89 @ 107,1449 · 可见 · 100%
    - Zain Cash (/9/4/2) — z=2 · 文本 · 199×32 @ 246,1475 · 可见 · 100%
  - 4 (/9/5) — z=5 · 组 · 528×143 @ 651,1420 · 可见 · 100%
    - Rectangle 1 copy 11 (/9/5/0) — z=0 · 形状 · 528×143 @ 651,1420 · 可见 · 100% · 效果
    - -s-FastPay (/9/5/1) — z=1 · 组 · 95×95 @ 698,1447 · 可见 · 100%
      - -slice- (/9/5/1/0) — z=0 · 形状 · 95×95 @ 698,1447 · 可见 · 100%
      - FastPay (/9/5/1/1) — z=1 · 像素 · 90×89 @ 700,1450 · 可见 · 100%
    - Fast Pay (/9/5/2) — z=2 · 文本 · 171×39 @ 840,1477 · 可见 · 100%
  - 5 (/9/6) — z=6 · 组 · 528×143 @ 59,1594 · 可见 · 100%
    - Rectangle 1 copy 11 (/9/6/0) — z=0 · 形状 · 528×143 @ 59,1594 · 可见 · 100% · 效果
    - -s-Areeba (/9/6/1) — z=1 · 组 · 95×95 @ 105,1618 · 可见 · 100%
      - -slice- (/9/6/1/0) — z=0 · 形状 · 95×95 @ 105,1618 · 可见 · 100%
      - Areeba (/9/6/1/1) — z=1 · 像素 · 89×90 @ 108,1621 · 可见 · 100%
    - Areeba (/9/6/2) — z=2 · 文本 · 139×32 @ 245,1650 · 可见 · 100%
- Selected (/10) — z=10 · 组 · 168×133 @ 63,961 · 可见 · 100%
  - VIP (/10/0) — z=0 · 文本 · 74×35 @ 157,1048 · 可见 · 100%
  - -s-villable (/10/1) — z=1 · 组 · 55×55 @ 63,1039 · 可见 · 100%
    - -slice- (/10/1/0) — z=0 · 形状 · 55×55 @ 63,1039 · 可见 · 100%
    - Ellipse 8 (/10/1/1) — z=1 · 形状 · 53×53 @ 64,1040 · 可见 · 100% · 效果
    - Shape 17 (/10/1/2) — z=2 · 形状 · 33×26 @ 74,1053 · 可见 · 100% · 效果
  - Selected (/10/2) — z=2 · 文本 · 150×29 @ 65,961 · 可见 · 100%
- Payment Method (/11) — z=11 · 文本 · 383×45 @ 66,831 · 可见 · 100% · 逻辑组=card
- -s-Close (/12) — z=12 · 组 · 114×115 @ 1066,592 · 可见 · 100%
  - -slice- (/12/0) — z=0 · 形状 · 114×115 @ 1066,592 · 隐藏 · 100%
  - Ellipse 1 (/12/1) — z=1 · 形状 · 112×113 @ 1067,593 · 可见 · 60%
  - Shape 1 (/12/2) — z=2 · 形状 · 51×51 @ 1097,624 · 可见 · 100% · 逻辑组=icon-button
  - Shape 1 copy (/12/3) — z=3 · 形状 · 52×51 @ 1096,623 · 可见 · 100% · 逻辑组=icon-button

## 逻辑编组建议

以下分组只存在于 Design IR（`logicalGroups` 与节点 `logicalGroupId`），用于划分前端组件；图层树成员行末带 `逻辑组=` 标记。应用内可通过桥接把建议写入当前文档内存，仍需另存并重开才持久化。`layout` 由成员边界推断（row/column/stack、间距与对齐），仅作为 CSS 布局提示。

| ID | 建议名 | 父级 | 成员 | 边界 | 布局 | 说明 |
|---|---|---|---|---|---|---|
| group:root:2+5+6+7+11 | card | 根图层 | Rectangle 5 copy 4、25,000、28,000、Total Cost IQD、Payment Method | 1244×1967 @ -1,752 | 叠加 · 无间距 · 混合 | 5 个同级图层边界相邻且未编组；结构角色：卡片（带背景的 5 元素容器） |
| group:12:12/2+12/3 | icon-button | -s-Close (/12) | Shape 1、Shape 1 copy | 52×52 @ 1096,623 | 叠加 · 无间距 · 居中 | 2 个同级图层边界相邻且未编组；结构角色：图标按钮（无文本方形控件组 52×52） |

## 文本层

| 图层 | 内容 | 字体 | 字号 | 颜色 | 对齐 | 粗体 | 边界 | Z |
|---|---|---|---|---|---|---|---|---|
| Pay Now | Pay Now | PingFangSC-Semibold | 48px | #ffffff | center | 是 | 208×46 @ 519,2334 | 1 |
| I have readed and agree Membership Service Agreement | I have readed and agree Membership Service Agreement | PingFangSC-Regular | 27.14px | — | left | — | 1001×37 @ 127,2487 | 1 |
| 25,000 | 25,000 | PingFangSC-Semibold | 65.71px | #ffffff | center | 是 | 294×85 @ 885,2161 | 5 |
| 28,000 | 28,000 | PingFangSC-Semibold | 30px | #ffffff | center | 是 | 166×39 @ 1011,2094 | 6 |
| Total Cost IQD | Total Cost IQD | PingFangSC-Regular | 30px | #ffffff | left | — | 289×34 @ 64,2197 | 7 |
| Promo Code Here | Promo Code Here | PingFangSC-Regular | 27.14px | #666666 | left | — | 314×29 @ 107,1863 | 1 |
| Verify | Verify | PingFangSC-Regular | 30px | #ffffff | center | — | 113×39 @ 1004,1861 | 3 |
| Payment Method | Payment Method | PingFangSC-Regular | 27.14px | #666666 | left | — | 295×36 @ 62,1169 | 0 |
| (Visa & Mastercard accepted) | (Visa & Mastercard accepted) | PingFangSC-Regular | 27.14px | #ffffff | left | — | 526×40 @ 400,1165 | 1 |
| Asia Pay | Asia Pay | PingFangSC-Semibold | 30px | #ffffff | left | 是 | 174×40 @ 245,1301 | 2 |
| QI Card | QI Card | PingFangSC-Semibold | 30px | #ffffff | left | 是 | 150×35 @ 839,1301 | 2 |
| Zain Cash | Zain Cash | PingFangSC-Semibold | 30px | #ffffff | left | 是 | 199×32 @ 246,1475 | 2 |
| Fast Pay | Fast Pay | PingFangSC-Semibold | 30px | #ffffff | left | 是 | 171×39 @ 840,1477 | 2 |
| Areeba | Areeba | PingFangSC-Semibold | 30px | #ffffff | left | 是 | 139×32 @ 245,1650 | 2 |
| VIP | VIP | PingFangSC-Semibold | 34.29px | #ffffff | left | 是 | 74×35 @ 157,1048 | 0 |
| Selected | Selected | PingFangSC-Regular | 27.14px | #666666 | left | — | 150×29 @ 65,961 | 2 |
| Payment Method | Payment Method | PingFangSC-Semibold | 48px | #ffffff | left | 是 | 383×45 @ 66,831 | 11 |

## 资产

| 名称 | 语义名 | 文件 | 路径 | 边界 | 类型 | Z |
|---|---|---|---|---|---|---|
| Pay Now | — | pay-now.png | /3 | 1118×155 @ 62,2277 | 组 | 3 |
| Rectangle 16 copy 2 | — | rectangle-16.png | /3/0 | 1118×155 @ 62,2277 | 形状 | 0 |
| Promo Code | — | promo-code.png | /8 | 1122×131 @ 58,1812 | 组 | 8 |
| Rectangle 1 copy 12 | — | rectangle-1.png | /8/0 | 837×131 @ 58,1812 | 形状 | 0 |
| 1 | — | 1.png | /9/2 | 528×143 @ 58,1245 | 组 | 2 |
| Rectangle 1 copy 11 | — | rectangle-1-2.png | /9/2/0 | 528×143 @ 58,1245 | 形状 | 0 |
| 2 | — | 2.png | /9/3 | 528×143 @ 652,1245 | 组 | 3 |
| Rectangle 1 copy 11 | — | rectangle-1-3.png | /9/3/0 | 528×143 @ 652,1245 | 形状 | 0 |
| 3 | — | 3.png | /9/4 | 528×143 @ 58,1419 | 组 | 4 |
| Rectangle 1 copy 11 | — | rectangle-1-4.png | /9/4/0 | 528×143 @ 58,1419 | 形状 | 0 |
| 4 | — | 4.png | /9/5 | 528×143 @ 651,1420 | 组 | 5 |
| Rectangle 1 copy 11 | — | rectangle-1-5.png | /9/5/0 | 528×143 @ 651,1420 | 形状 | 0 |
| 5 | — | 5.png | /9/6 | 528×143 @ 59,1594 | 组 | 6 |
| Rectangle 1 copy 11 | — | rectangle-1-6.png | /9/6/0 | 528×143 @ 59,1594 | 形状 | 0 |
| agree | — | agree.png | /4 | 1064×50 @ 64,2476 | 组 | 4 |
| Rectangle 1 copy 13 | — | rectangle-1-7.png | /8/2 | 239×131 @ 941,1812 | 形状 | 2 |
| -s-Close | — | s-close.png | /12 | 114×115 @ 1066,592 | 组 | 12 |
| Ellipse 1 | — | ellipse-1.png | /12/1 | 112×113 @ 1067,593 | 形状 | 1 |
| -s-AsiaPay | — | s-asiapay.png | /9/2/1 | 95×95 @ 106,1272 | 组 | 1 |
| -slice- | — | slice.png | /9/2/1/0 | 95×95 @ 106,1272 | 形状 | 0 |
| -s-QICard | — | s-qicard.png | /9/3/1 | 95×95 @ 698,1272 | 组 | 1 |
| -slice- | — | slice-2.png | /9/3/1/0 | 95×95 @ 698,1272 | 形状 | 0 |
| -s-ZainCash | — | s-zaincash.png | /9/4/1 | 95×95 @ 105,1446 | 组 | 1 |
| -slice- | — | slice-3.png | /9/4/1/0 | 95×95 @ 105,1446 | 形状 | 0 |
| -s-FastPay | — | s-fastpay.png | /9/5/1 | 95×95 @ 698,1447 | 组 | 1 |
| -slice- | — | slice-4.png | /9/5/1/0 | 95×95 @ 698,1447 | 形状 | 0 |
| -s-Areeba | — | s-areeba.png | /9/6/1 | 95×95 @ 105,1618 | 组 | 1 |
| -slice- | — | slice-5.png | /9/6/1/0 | 95×95 @ 105,1618 | 形状 | 0 |
| ZainCash | — | zaincash.png | /9/4/1/1 | 90×89 @ 107,1449 | 像素 | 1 |
| FastPay | — | fastpay.png | /9/5/1/1 | 90×89 @ 700,1450 | 像素 | 1 |
| Areeba | — | areeba.png | /9/6/1/1 | 89×90 @ 108,1621 | 像素 | 1 |
| AsiaPay | — | asiapay.png | /9/2/1/1 | 89×89 @ 109,1275 | 像素 | 1 |
| QICard | — | qicard.png | /9/3/1/1 | 89×89 @ 701,1275 | 像素 | 1 |
| -s-villable | — | s-villable.png | /10/1 | 55×55 @ 63,1039 | 组 | 1 |
| -slice- | — | slice-6.png | /10/1/0 | 55×55 @ 63,1039 | 形状 | 0 |
| Ellipse 8 | — | ellipse-8.png | /10/1/1 | 53×53 @ 64,1040 | 形状 | 1 |
| Shape 1 copy | — | shape-1.png | /12/3 | 52×51 @ 1096,623 | 形状 | 3 |
| Shape 1 | — | shape-1-2.png | /12/2 | 51×51 @ 1097,624 | 形状 | 2 |
| Rectangle 18 | — | rectangle-18.png | /4/0 | 50×50 @ 64,2476 | 形状 | 0 |
| Shape 17 | — | shape-17.png | /10/1/2 | 33×26 @ 74,1053 | 形状 | 2 |

## 合并候选

以下组的结构角色为角标、按钮、输入框或图标按钮等组件，且边界紧凑，适合在 PSD 中合并为单层素材；`merged/` 提供对应区域的单张合成裁剪，尚未写入文档。

| 组 | 建议名 | 类型 | 成员 | 边界 | 布局 | 占画布 | 文件 |
|---|---|---|---|---|---|---|---|
| Selected | component-merged | 组件 | VIP、-s-villable、Selected | 168×133 @ 63,961 | 叠加 · 无间距 · 混合 | 0.7% | merged/component-merged.png |
| -s-Close | icon-button-merged | 组件 | Ellipse 1、Shape 1、Shape 1 copy | 112×113 @ 1067,593 | 叠加 · 无间距 · 居中 | 0.4% | merged/icon-button-merged.png |
| Pay Now | button-merged | 组件 | Rectangle 16 copy 2、Pay Now | 1118×155 @ 62,2277 | 叠加 · 无间距 · 居中 | 5.1% | merged/button-merged.png |
| agree | checkbox-row-merged | 组件 | Rectangle 18、I have readed and agree Membership Service Agreement | 1064×50 @ 64,2476 | 横向 · 间距 13px · 末端对齐 | 1.6% | merged/checkbox-row-merged.png |
| Promo Code | form-row-merged | 组件 | Rectangle 1 copy 12、Promo Code Here、Rectangle 1 copy 13、Verify | 1122×131 @ 58,1812 | 叠加 · 无间距 · 混合 | 4.4% | merged/form-row-merged.png |
| 1 | button-merged | 组件 | Rectangle 1 copy 11、-s-AsiaPay、Asia Pay | 528×143 @ 58,1245 | 叠加 · 无间距 · 混合 | 2.2% | merged/button-merged-2.png |
| 2 | button-merged-2 | 组件 | Rectangle 1 copy 11、-s-QICard、QI Card | 528×143 @ 652,1245 | 叠加 · 无间距 · 混合 | 2.2% | merged/button-merged-2-2.png |
| 3 | button-merged-3 | 组件 | Rectangle 1 copy 11、-s-ZainCash、Zain Cash | 528×143 @ 58,1419 | 叠加 · 无间距 · 混合 | 2.2% | merged/button-merged-3.png |
| 4 | button-merged-4 | 组件 | Rectangle 1 copy 11、-s-FastPay、Fast Pay | 528×143 @ 651,1420 | 叠加 · 无间距 · 混合 | 2.2% | merged/button-merged-4.png |
| 5 | button-merged-5 | 组件 | Rectangle 1 copy 11、-s-Areeba、Areeba | 528×143 @ 59,1594 | 叠加 · 无间距 · 混合 | 2.2% | merged/button-merged-5.png |

## 使用建议

1. 可直接打开 `page.html` 检查静态还原；它按画布百分比绝对定位，每个 `<img>` 带图层路径、语义名、边界与文本样式。以它作为页面转换起点，再参考 `design-ir.json` 的层级改写为组件；`paintOrder` 越大越靠上，可映射为 CSS z-index。
2. 切图节点的 `assetId` 对应 `manifest.json` 的资产 id 与 `assets/` 文件，可据此把该节点渲染为 `<img>`，不必按名称猜测。
3. `design-ir.json` 的 `logicalGroups` 与节点 `logicalGroupId` 是规则版逻辑分组；每组 `layout` 给出 row/column/stack、间距与对齐，可作为 flex 布局线索，但它是边界推断，不改变 PSD 层级。`page.html` 中对应 `<section class="lf-component">`（`display:contents`）与 `data-layout-*` 属性。
4. 文本层优先使用真实文本与上表的字体/字号/颜色/对齐，不要把文字烘焙进图片。
5. 边界使用 PSD 像素坐标；网页实现时按设计宽度等比换算。
6. 重叠切图在小尺寸资产中会覆盖大尺寸资产；页面重建预览已按此规则生成。
7. 图层树中的剪贴/蒙版/效果/混合标记来自 PSD 元数据；切图是合成裁剪，效果已反映在像素中，但不等于隔离渲染。
8. 合并候选用于指导 PSD 清理与前端组件拆分；`merged/` 是合成图裁切，可直接引用，但不代表 PSD 已合并；应用内可通过桥接执行合并，需另存并重开。
9. @2x 输出由 1x 最近邻放大，不是原生 2x 渲染；需要原生 2x 时应重新渲染而不是缩放。
