# PSD 图层语义命名与合并复核任务

你正在为一份 PSD 生成图层命名和合并复核计划。请只输出计划 JSON，不要生成代码或修改文件。

## 文档
- 项目：ai-merge-store-d
- 源文件：Store_D.psd
- 画布：1242×5988
- 图层总数：270
- 命名候选数：31
- 合并复核候选数：10
- 生成时间：2026-10-22T10:52:11.208Z

## 命名规则
1. 只处理 candidates 中列出的图层，path 必须原样返回，不得新增、删除或猜测路径。
2. 新名称优先使用小写 kebab-case；中文内容可直接使用中文。只允许字母、数字、点、下划线、连字符，长度 2–80。
3. 不得使用通用名（如 layer-1、rectangle-2、group-3、图层 1、矩形 2）。
4. 同一父级下名称必须唯一，不得与现有兄弟名称冲突。
5. 结合图层文本、父级名称、兄弟名称、尺寸与布局提示命名；layout.direction 的 row/column/stack 分别表示横向排列、纵向排列、叠加。
6. 看不到像素时不要臆测品牌或具体图标，可用描述性结构名。
7. 只为有把握的候选返回条目；没有把握的候选可以省略，保留原名。
8. reason 用中文简述依据，不超过 80 字。
9. 只输出一个 JSON 对象，不要 Markdown 代码围栏，不要解释文字。

## 合并复核规则
1. 只复核 mergeCandidates 中列出的图层组，path 必须原样返回，不得新增或猜测路径。
2. decision 只能是 merge 或 keep。组内图层共同构成一个不可再分的 UI 单元（角标、图标按钮、输入框、复选行或紧凑卡片）时用 merge；属于布局容器、区块，或子层需要独立切图/定位时用 keep。
3. 只依据边界、尺寸占比、子层类型统计、文本存在与否、嵌套组数量与布局方向判断；不要依据文案内容决定合并。
4. decision 为 merge 时必须提供 name：优先小写 kebab-case 或中文，2–80 字符，不得是通用名，同一父级下必须唯一。decision 为 keep 时省略 name。
5. 只为有把握的候选返回条目；没有把握的候选可以省略，保持未复核状态。
6. reason 用中文简述依据，不超过 80 字。
7. 合并会把组内图层栅格化为单层，仍需人工审核后执行；不要自动合并整页区块。

## 图层结构
```text
- 0 [pixel] "Layer 61"
- 1 [shape] "Rectangle 1"
- 2 [group] "VIP Exclusive Games" (22 子层)
  - 2/0 [text] "VIP Exclusive Games"
  - 2/1 [shape] "Rectangle 10"
  - 2/2 [pixel] "Layer 53"
  - 2/3 [text] "DEATH STRANDING 2"
  - 2/4 [shape] "Rectangle 10 copy"
  - 2/5 [pixel] "Layer 54"
  - 2/6 [text] "Days Gone Remastered"
  - 2/7 [shape] "Rectangle 10 copy 2"
  - 2/8 [pixel] "Layer 55"
  - 2/9 [text] "Until Dawn"
  - 2/10 [shape] "Rectangle 10 copy 3"
  - 2/11 [pixel] "Layer 56"
  - 2/12 [text] "Marvel's Spider-Man 2"
  - 2/13 [shape] "Rectangle 10 copy 6"
  - 2/14 [pixel] "Layer 57"
  - 2/15 [text] "God of War Ragnarök"
  - 2/16 [shape] "Rectangle 10 copy 7"
  - 2/17 [pixel] "Layer 58"
  - 2/18 [text] "Helldivers™ 2"
  - 2/19 [shape] "Rectangle 10 copy 8"
  - 2/20 [pixel] "Layer 59"
  - 2/21 [text] "Ratchet & Clank:Rift..."
- 3 [group] "VIP Weekly Free Game" (26 子层)
  - 3/0 [group] "Group 54"
  - 3/1 [group] "Group 53"
  - 3/2 [shape] "Rectangle 1 copy 8"
  - 3/3 [shape] "Rectangle 10 copy 4"
  - 3/4 [pixel] "Layer 51"
  - 3/5 [text] "Norland"
  - 3/6 [shape] "Rectangle 10 copy 5"
  - 3/7 [pixel] "Layer 52"
  - 3/8 [text] "Vertigo 2"
  - 3/9 [shape] "Rectangle 11 copy 4"
  - 3/10 [shape] "Shape 8"
  - 3/11 [shape] "Rectangle 11"
  - 3/12 [text] "VR"
  - 3/13 [shape] "Rectangle 11 copy"
  - 3/14 [text] "Indie"
  - 3/15 [shape] "Rectangle 11 copy 2"
  - 3/16 [text] "Sci-fi"
  - 3/17 [shape] "Rectangle 11 copy 3"
  - 3/18 [text] "First-Person"
  - 3/19 [shape] "Rectangle 11 copy 5"
  - 3/20 [text] "FPS+"
  - 3/21 [shape] "Rectangle 11 copy 7"
  - 3/22 [text] "Shooter"
  - 3/23 [text] "VIP Weekly Free Game"
  - 3/24 [shape] "Rectangle 1 copy 10"
  - 3/25 [text] "2Day 18:31:41"
- 4 [group] "Nav" (5 子层)
  - 4/0 [shape] "nav_bg"
  - 4/1 [group] "Profile" (3 子层)
    - 4/1/0 [shape] "Rectangle 2 copy 9"
    - 4/1/1 [text] "Profile"
    - 4/1/2 [group] "-s-Profile" (2 子层)
      - 4/1/2/0 [shape] "-slice-"
      - 4/1/2/1 [shape] "Profile"
  - 4/2 [group] "Vip" (3 子层)
    - 4/2/0 [shape] "Rectangle 2 copy 4"
    - 4/2/1 [text] "Vip"
    - 4/2/2 [group] "-s-Vip" (2 子层)
      - 4/2/2/0 [shape] "-slice-"
      - 4/2/2/1 [shape] "Vip"
  - 4/3 [group] "Library" (3 子层)
    - 4/3/0 [shape] "Rectangle 2 copy 7"
    - 4/3/1 [text] "Library"
    - 4/3/2 [group] "-s-Library" (2 子层)
      - 4/3/2/0 [shape] "-slice-"
      - 4/3/2/1 [shape] "Library"
  - 4/4 [group] "Home" (3 子层)
    - 4/4/0 [shape] "Rectangle 2 copy 8"
    - 4/4/1 [text] "Home"
    - 4/4/2 [group] "-s-Home" (2 子层)
      - 4/4/2/0 [shape] "-slice-"
      - 4/4/2/1 [shape] "Home"
- 5 [group] "about" (10 子层)
  - 5/0 [group] "VIP" (9 子层)
    - 5/0/0 [shape] "Rectangle 14 copy 4"
    - 5/0/1 [shape] "Rectangle 14 copy 5"
    - 5/0/2 [group] "-s-VIP_pic" (2 子层)
      - 5/0/2/0 [shape] "-slice-"
      - 5/0/2/1 [pixel] "vip_s_pic"
    - 5/0/3 [group] "about" (5 子层)
      - 5/0/3/0 [group] "-s-购买" (2 子层)
        - 5/0/3/0/0 [shape] "-slice-"
        - 5/0/3/0/1 [pixel] "购买"
      - 5/0/3/1 [text] "28,000"
      - 5/0/3/2 [text] "25,000"
      - 5/0/3/3 [text] "IQD"
      - 5/0/3/4 [text] "VIP / 120mins"
    - 5/0/4 [group] "-s-VIP__icon" (2 子层)
      - 5/0/4/0 [shape] "-slice-"
      - 5/0/4/1 [pixel] "vip_s_icon"
    - 5/0/5 [group] "-s-dis_icon" (2 子层)
      - 5/0/5/0 [shape] "-slice-"
      - 5/0/5/1 [shape] "dis_icon"
    - 5/0/6 [text] "-30%"
    - 5/0/7 [shape] "Rectangle 18 copy"
    - 5/0/8 [text] "First Google Play"
  - 5/1 [group] "Standard" (7 子层)
    - 5/1/0 [shape] "Rectangle 14 copy 4"
    - 5/1/1 [shape] "Rectangle 14 copy 5"
    - 5/1/2 [group] "-s-Standard_pic" (2 子层)
      - 5/1/2/0 [shape] "-slice-"
      - 5/1/2/1 [pixel] "standard_s_pic"
    - 5/1/3 [group] "about" (4 子层)
      - 5/1/3/0 [group] "-s-购买 copy" (2 子层)
        - 5/1/3/0/0 [shape] "-slice-"
        - 5/1/3/0/1 [pixel] "购买 copy"
      - 5/1/3/1 [text] "Standard / 90mins"
      - 5/1/3/2 [text] "20,000"
      - 5/1/3/3 [text] "IQD"
    - 5/1/4 [group] "-s-Standard_icon" (2 子层)
      - 5/1/4/0 [shape] "-slice-"
      - 5/1/4/1 [pixel] "standard_s_icon"
    - 5/1/5 [shape] "Rectangle 18 copy 3"
    - 5/1/6 [text] "First Google Play"
  - 5/2 [group] "Essential" (9 子层)
    - 5/2/0 [shape] "Rectangle 14 copy 4"
    - 5/2/1 [shape] "Rectangle 14 copy 5"
    - 5/2/2 [group] "-s-Essential_pic" (2 子层)
      - 5/2/2/0 [shape] "-slice-"
      - 5/2/2/1 [pixel] "essential_s_pic"
    - 5/2/3 [group] "about" (7 子层)
      - 5/2/3/0 [shape] "Rectangle 23"
      - 5/2/3/1 [text] "Limited"
      - 5/2/3/2 [group] "-s-购买 copy" (2 子层)
        - 5/2/3/2/0 [shape] "-slice-"
        - 5/2/3/2/1 [pixel] "购买 copy"
      - 5/2/3/3 [text] "12,000"
      - 5/2/3/4 [text] "10,000"
      - 5/2/3/5 [text] "IQD"
      - 5/2/3/6 [text] "Essential / 60mins"
    - 5/2/4 [group] "-s-Essential_icon" (2 子层)
      - 5/2/4/0 [shape] "-slice-"
      - 5/2/4/1 [pixel] "essential_s_icon"
    - 5/2/5 [group] "Group 75" (3 子层)
      - 5/2/5/0 [shape] "Shape 21"
      - 5/2/5/1 [pixel] "hot"
      - 5/2/5/2 [text] "most popular"
    - 5/2/6 [group] "-s-most popular" (2 子层)
      - 5/2/6/0 [shape] "-slice-"
      - 5/2/6/1 [pixel] "most popular"
    - 5/2/7 [group] "-s-dis_icon" (2 子层)
      - 5/2/7/0 [shape] "-slice-"
      - 5/2/7/1 [shape] "dis_icon"
    - 5/2/8 [text] "-30% copy"
  - 5/3 [group] "3h" (9 子层)
    - 5/3/0 [shape] "Rectangle 14 copy 4"
    - 5/3/1 [shape] "Rectangle 14 copy 5"
    - 5/3/2 [group] "-s-nt5_pic" (2 子层)
      - 5/3/2/0 [shape] "-slice-"
      - 5/3/2/1 [pixel] "game_pass_pic"
    - 5/3/3 [group] "about" (4 子层)
      - 5/3/3/0 [group] "-s-购买 copy" (2 子层)
        - 5/3/3/0/0 [shape] "-slice-"
        - 5/3/3/0/1 [pixel] "购买 copy"
      - 5/3/3/1 [text] "30,000"
      - 5/3/3/2 [text] "IQD"
      - 5/3/3/3 [text] "3h Game Time"
    - 5/3/4 [group] "-s-3_icon" (2 子层)
      - 5/3/4/0 [shape] "-slice-"
      - 5/3/4/1 [pixel] "3_s_icon"
    - 5/3/5 [group] "Group 75" (3 子层)
      - 5/3/5/0 [shape] "Shape 21"
      - 5/3/5/1 [pixel] "hot"
      - 5/3/5/2 [text] "most popular"
    - 5/3/6 [group] "-s-most popular" (2 子层)
      - 5/3/6/0 [shape] "-slice-"
      - 5/3/6/1 [pixel] "most popular"
    - 5/3/7 [shape] "Rectangle 18 copy 5"
    - 5/3/8 [text] "First Google Play copy"
  - 5/4 [group] "5h" (5 子层)
    - 5/4/0 [shape] "Rectangle 14 copy 4"
    - 5/4/1 [shape] "Rectangle 14 copy 5"
    - 5/4/2 [group] "-s-nt5_pic" (2 子层)
      - 5/4/2/0 [shape] "-slice-"
      - 5/4/2/1 [pixel] "nt5_pic"
    - 5/4/3 [group] "about" (4 子层)
      - 5/4/3/0 [group] "-s-购买 copy" (2 子层)
        - 5/4/3/0/0 [shape] "-slice-"
        - 5/4/3/0/1 [pixel] "购买 copy"
      - 5/4/3/1 [text] "50,000"
      - 5/4/3/2 [text] "IQD"
      - 5/4/3/3 [text] "5h Game Time"
    - 5/4/4 [group] "-s-3_icon" (2 子层)
      - 5/4/4/0 [shape] "-slice-"
      - 5/4/4/1 [pixel] "5_s_icon"
  - 5/5 [group] "10h" (8 子层)
    - 5/5/0 [shape] "Rectangle 14 copy 4"
    - 5/5/1 [shape] "Rectangle 14 copy 5"
    - 5/5/2 [group] "-s-nt5_pic" (2 子层)
      - 5/5/2/0 [shape] "-slice-"
      - 5/5/2/1 [pixel] "nt5_pic"
    - 5/5/3 [group] "about" (4 子层)
      - 5/5/3/0 [group] "-s-购买 copy" (2 子层)
        - 5/5/3/0/0 [shape] "-slice-"
        - 5/5/3/0/1 [pixel] "购买 copy"
      - 5/5/3/1 [text] "100,000"
      - 5/5/3/2 [text] "IQD"
      - 5/5/3/3 [text] "10h Game Time"
    - 5/5/4 [group] "-s-3_icon" (2 子层)
      - 5/5/4/0 [shape] "-slice-"
      - 5/5/4/1 [pixel] "10_s_icon"
    - 5/5/5 [group] "-s-dis_icon" (2 子层)
      - 5/5/5/0 [shape] "-slice-"
      - 5/5/5/1 [shape] "dis_icon"
    - 5/5/6 [text] "-30%"
    - 5/5/7 [group] "Group 75" (3 子层)
      - 5/5/7/0 [shape] "Shape 21"
      - 5/5/7/1 [pixel] "hot"
      - 5/5/7/2 [text] "most popular"
  - 5/6 [group] "select" (1 子层)
    - 5/6/0 [group] "select" (9 子层)
      - 5/6/0/0 [shape] "Rectangle 14 copy 2"
      - 5/6/0/1 [text] "All"
      - 5/6/0/2 [text] "VIP Packages"
      - 5/6/0/3 [text] "Monthly Packages"
      - 5/6/0/4 [text] "Hour Packages"
      - 5/6/0/5 [text] "Unlimited Play"
      - 5/6/0/6 [text] "Queue Pass"
      - 5/6/0/7 [text] "High-Definition"
      - 5/6/0/8 [text] "Limited Purchase"
  - 5/7 [group] "Group 60" (2 子层)
    - 5/7/0 [shape] "Shape 6 copy"
    - 5/7/1 [shape] "Shape 6 copy 2"
  - 5/8 [group] "Group 60 copy" (2 子层)
    - 5/8/0 [shape] "Shape 6 copy"
    - 5/8/1 [shape] "Shape 6 copy 2"
  - 5/9 [text] "Purchase Packages"
- 6 [group] "-s-Layer 61" (2 子层)
  - 6/0 [shape] "-slice-"
  - 6/1 [pixel] "Hue/Saturation 1"
- 7 [group] "组 1" (5 子层)
  - 7/0 [group] "head" (3 子层)
    - 7/0/0 [shape] "Ellipse 5"
    - 7/0/1 [pixel] "Layer 49"
    - 7/0/2 [pixel] "Layer 60"
  - 7/1 [group] "-s-vip" (3 子层)
    - 7/1/0 [shape] "-slice-"
    - 7/1/1 [shape] "Ellipse 6"
    - 7/1/2 [shape] "Raccoon VIP"
  - 7/2 [text] "PapaDaddy"
  - 7/3 [text] "ID: 847124"
  - 7/4 [text] "VIP expired: 2026-02-28 18:30"
- 8 [group] "Head" (5 子层)
  - 8/0 [shape] "Rectangle 2 copy 2"
  - 8/1 [group] "消息" (4 子层)
    - 8/1/0 [shape] "Rectangle 8 copy 7"
    - 8/1/1 [group] "-s-message" (3 子层)
      - 8/1/1/0 [shape] "-slice-"
      - 8/1/1/1 [shape] "Shape 7"
      - 8/1/1/2 [shape] "Ellipse 3 copy 2"
    - 8/1/2 [shape] "Ellipse 3"
    - 8/1/3 [text] "3"
  - 8/2 [group] "搜索" (2 子层)
    - 8/2/0 [shape] "Rectangle 8 copy 8"
    - 8/2/1 [group] "-s-搜索" (3 子层)
      - 8/2/1/0 [shape] "-slice-"
      - 8/2/1/1 [shape] "Ellipse 2"
      - 8/2/1/2 [shape] "Shape 6"
  - 8/3 [text] "VIP"
  - 8/4 [group] "返回" (1 子层)
    - 8/4/0 [group] "Group 60" (2 子层)
      - 8/4/0/0 [shape] "Shape 6 copy"
      - 8/4/0/1 [shape] "Shape 6 copy 2"
- 9 [pixel] "top"
```

## 候选（JSON）
```json
{
  "schema": "layerforge.ai-naming.request",
  "schemaVersion": "0.2.0",
  "generatedAt": "2026-10-22T10:52:11.208Z",
  "project": {
    "name": "ai-merge-store-d",
    "sourceFileName": "Store_D.psd",
    "width": 1242,
    "height": 5988,
    "layerCount": 270
  },
  "candidates": [
    {
      "path": "1",
      "layerId": "2",
      "currentName": "Rectangle 1",
      "kind": "shape",
      "bounds": {
        "x": 0,
        "y": 5020,
        "width": 1242,
        "height": 970
      },
      "visible": true,
      "parentPath": null,
      "parentName": null,
      "siblingIndex": 2,
      "siblingCount": 10,
      "siblingNames": [
        "Layer 61",
        "VIP Exclusive Games",
        "VIP Weekly Free Game",
        "Nav",
        "about",
        "-s-Layer 61",
        "组 1",
        "Head",
        "top"
      ],
      "childNames": [],
      "textSamples": [],
      "reasons": [
        "通用名称"
      ]
    },
    {
      "path": "2/1",
      "layerId": "5",
      "currentName": "Rectangle 10",
      "kind": "shape",
      "bounds": {
        "x": 64,
        "y": 3998,
        "width": 525,
        "height": 296
      },
      "visible": true,
      "parentPath": "2",
      "parentName": "VIP Exclusive Games",
      "siblingIndex": 2,
      "siblingCount": 22,
      "siblingNames": [
        "VIP Exclusive Games",
        "Layer 53",
        "DEATH STRANDING 2",
        "Rectangle 10 copy",
        "Layer 54",
        "Days Gone Remastered",
        "Rectangle 10 copy 2",
        "Layer 55",
        "Until Dawn",
        "Rectangle 10 copy 3",
        "Layer 56",
        "Marvel's Spider-Man 2"
      ],
      "childNames": [],
      "textSamples": [],
      "reasons": [
        "通用名称",
        "同级重名"
      ]
    },
    {
      "path": "2/4",
      "layerId": "8",
      "currentName": "Rectangle 10 copy",
      "kind": "shape",
      "bounds": {
        "x": 653,
        "y": 3998,
        "width": 525,
        "height": 296
      },
      "visible": true,
      "parentPath": "2",
      "parentName": "VIP Exclusive Games",
      "siblingIndex": 5,
      "siblingCount": 22,
      "siblingNames": [
        "VIP Exclusive Games",
        "Rectangle 10",
        "Layer 53",
        "DEATH STRANDING 2",
        "Layer 54",
        "Days Gone Remastered",
        "Rectangle 10 copy 2",
        "Layer 55",
        "Until Dawn",
        "Rectangle 10 copy 3",
        "Layer 56",
        "Marvel's Spider-Man 2"
      ],
      "childNames": [],
      "textSamples": [],
      "reasons": [
        "通用名称",
        "同级重名"
      ]
    },
    {
      "path": "2/7",
      "layerId": "11",
      "currentName": "Rectangle 10 copy 2",
      "kind": "shape",
      "bounds": {
        "x": 64,
        "y": 4415,
        "width": 525,
        "height": 296
      },
      "visible": true,
      "parentPath": "2",
      "parentName": "VIP Exclusive Games",
      "siblingIndex": 8,
      "siblingCount": 22,
      "siblingNames": [
        "VIP Exclusive Games",
        "Rectangle 10",
        "Layer 53",
        "DEATH STRANDING 2",
        "Rectangle 10 copy",
        "Layer 54",
        "Days Gone Remastered",
        "Layer 55",
        "Until Dawn",
        "Rectangle 10 copy 3",
        "Layer 56",
        "Marvel's Spider-Man 2"
      ],
      "childNames": [],
      "textSamples": [],
      "reasons": [
        "通用名称",
        "同级重名"
      ]
    },
    {
      "path": "2/10",
      "layerId": "14",
      "currentName": "Rectangle 10 copy 3",
      "kind": "shape",
      "bounds": {
        "x": 654,
        "y": 4415,
        "width": 525,
        "height": 296
      },
      "visible": true,
      "parentPath": "2",
      "parentName": "VIP Exclusive Games",
      "siblingIndex": 11,
      "siblingCount": 22,
      "siblingNames": [
        "VIP Exclusive Games",
        "Rectangle 10",
        "Layer 53",
        "DEATH STRANDING 2",
        "Rectangle 10 copy",
        "Layer 54",
        "Days Gone Remastered",
        "Rectangle 10 copy 2",
        "Layer 55",
        "Until Dawn",
        "Layer 56",
        "Marvel's Spider-Man 2"
      ],
      "childNames": [],
      "textSamples": [],
      "reasons": [
        "通用名称",
        "同级重名"
      ]
    },
    {
      "path": "2/13",
      "layerId": "17",
      "currentName": "Rectangle 10 copy 6",
      "kind": "shape",
      "bounds": {
        "x": 64,
        "y": 4831,
        "width": 525,
        "height": 296
      },
      "visible": true,
      "parentPath": "2",
      "parentName": "VIP Exclusive Games",
      "siblingIndex": 14,
      "siblingCount": 22,
      "siblingNames": [
        "VIP Exclusive Games",
        "Rectangle 10",
        "Layer 53",
        "DEATH STRANDING 2",
        "Rectangle 10 copy",
        "Layer 54",
        "Days Gone Remastered",
        "Rectangle 10 copy 2",
        "Layer 55",
        "Until Dawn",
        "Rectangle 10 copy 3",
        "Layer 56"
      ],
      "childNames": [],
      "textSamples": [],
      "reasons": [
        "通用名称",
        "同级重名"
      ]
    },
    {
      "path": "2/16",
      "layerId": "20",
      "currentName": "Rectangle 10 copy 7",
      "kind": "shape",
      "bounds": {
        "x": 653,
        "y": 4831,
        "width": 525,
        "height": 296
      },
      "visible": true,
      "parentPath": "2",
      "parentName": "VIP Exclusive Games",
      "siblingIndex": 17,
      "siblingCount": 22,
      "siblingNames": [
        "VIP Exclusive Games",
        "Rectangle 10",
        "Layer 53",
        "DEATH STRANDING 2",
        "Rectangle 10 copy",
        "Layer 54",
        "Days Gone Remastered",
        "Rectangle 10 copy 2",
        "Layer 55",
        "Until Dawn",
        "Rectangle 10 copy 3",
        "Layer 56"
      ],
      "childNames": [],
      "textSamples": [],
      "reasons": [
        "通用名称",
        "同级重名"
      ]
    },
    {
      "path": "2/19",
      "layerId": "23",
      "currentName": "Rectangle 10 copy 8",
      "kind": "shape",
      "bounds": {
        "x": 64,
        "y": 5246,
        "width": 525,
        "height": 296
      },
      "visible": true,
      "parentPath": "2",
      "parentName": "VIP Exclusive Games",
      "siblingIndex": 20,
      "siblingCount": 22,
      "siblingNames": [
        "VIP Exclusive Games",
        "Rectangle 10",
        "Layer 53",
        "DEATH STRANDING 2",
        "Rectangle 10 copy",
        "Layer 54",
        "Days Gone Remastered",
        "Rectangle 10 copy 2",
        "Layer 55",
        "Until Dawn",
        "Rectangle 10 copy 3",
        "Layer 56"
      ],
      "childNames": [],
      "textSamples": [],
      "reasons": [
        "通用名称",
        "同级重名"
      ]
    },
    {
      "path": "3/0",
      "layerId": "27",
      "currentName": "Group 54",
      "kind": "group",
      "bounds": null,
      "visible": true,
      "parentPath": "3",
      "parentName": "VIP Weekly Free Game",
      "siblingIndex": 1,
      "siblingCount": 26,
      "siblingNames": [
        "Group 53",
        "Rectangle 1 copy 8",
        "Rectangle 10 copy 4",
        "Layer 51",
        "Norland",
        "Rectangle 10 copy 5",
        "Layer 52",
        "Vertigo 2",
        "Rectangle 11 copy 4",
        "Shape 8",
        "Rectangle 11",
        "VR"
      ],
      "childNames": [],
      "textSamples": [],
      "reasons": [
        "通用名称"
      ]
    },
    {
      "path": "3/1",
      "layerId": "28",
      "currentName": "Group 53",
      "kind": "group",
      "bounds": null,
      "visible": true,
      "parentPath": "3",
      "parentName": "VIP Weekly Free Game",
      "siblingIndex": 2,
      "siblingCount": 26,
      "siblingNames": [
        "Group 54",
        "Rectangle 1 copy 8",
        "Rectangle 10 copy 4",
        "Layer 51",
        "Norland",
        "Rectangle 10 copy 5",
        "Layer 52",
        "Vertigo 2",
        "Rectangle 11 copy 4",
        "Shape 8",
        "Rectangle 11",
        "VR"
      ],
      "childNames": [],
      "textSamples": [],
      "reasons": [
        "通用名称"
      ]
    },
    {
      "path": "3/3",
      "layerId": "30",
      "currentName": "Rectangle 10 copy 4",
      "kind": "shape",
      "bounds": {
        "x": 64,
        "y": 3086,
        "width": 768,
        "height": 432
      },
      "visible": true,
      "parentPath": "3",
      "parentName": "VIP Weekly Free Game",
      "siblingIndex": 4,
      "siblingCount": 26,
      "siblingNames": [
        "Group 54",
        "Group 53",
        "Rectangle 1 copy 8",
        "Layer 51",
        "Norland",
        "Rectangle 10 copy 5",
        "Layer 52",
        "Vertigo 2",
        "Rectangle 11 copy 4",
        "Shape 8",
        "Rectangle 11",
        "VR"
      ],
      "childNames": [],
      "textSamples": [],
      "reasons": [
        "通用名称",
        "同级重名"
      ]
    },
    {
      "path": "3/6",
      "layerId": "33",
      "currentName": "Rectangle 10 copy 5",
      "kind": "shape",
      "bounds": {
        "x": 896,
        "y": 3086,
        "width": 768,
        "height": 432
      },
      "visible": true,
      "parentPath": "3",
      "parentName": "VIP Weekly Free Game",
      "siblingIndex": 7,
      "siblingCount": 26,
      "siblingNames": [
        "Group 54",
        "Group 53",
        "Rectangle 1 copy 8",
        "Rectangle 10 copy 4",
        "Layer 51",
        "Norland",
        "Layer 52",
        "Vertigo 2",
        "Rectangle 11 copy 4",
        "Shape 8",
        "Rectangle 11",
        "VR"
      ],
      "childNames": [],
      "textSamples": [],
      "reasons": [
        "通用名称",
        "同级重名"
      ]
    },
    {
      "path": "3/9",
      "layerId": "36",
      "currentName": "Rectangle 11 copy 4",
      "kind": "shape",
      "bounds": {
        "x": 1103,
        "y": 2954,
        "width": 74,
        "height": 44
      },
      "visible": false,
      "parentPath": "3",
      "parentName": "VIP Weekly Free Game",
      "siblingIndex": 10,
      "siblingCount": 26,
      "siblingNames": [
        "Group 54",
        "Group 53",
        "Rectangle 1 copy 8",
        "Rectangle 10 copy 4",
        "Layer 51",
        "Norland",
        "Rectangle 10 copy 5",
        "Layer 52",
        "Vertigo 2",
        "Shape 8",
        "Rectangle 11",
        "VR"
      ],
      "childNames": [],
      "textSamples": [],
      "reasons": [
        "通用名称",
        "同级重名"
      ]
    },
    {
      "path": "3/10",
      "layerId": "37",
      "currentName": "Shape 8",
      "kind": "shape",
      "bounds": {
        "x": 1135,
        "y": 2965,
        "width": 13,
        "height": 22
      },
      "visible": false,
      "parentPath": "3",
      "parentName": "VIP Weekly Free Game",
      "siblingIndex": 11,
      "siblingCount": 26,
      "siblingNames": [
        "Group 54",
        "Group 53",
        "Rectangle 1 copy 8",
        "Rectangle 10 copy 4",
        "Layer 51",
        "Norland",
        "Rectangle 10 copy 5",
        "Layer 52",
        "Vertigo 2",
        "Rectangle 11 copy 4",
        "Rectangle 11",
        "VR"
      ],
      "childNames": [],
      "textSamples": [],
      "reasons": [
        "通用名称"
      ]
    },
    {
      "path": "3/11",
      "layerId": "38",
      "currentName": "Rectangle 11",
      "kind": "shape",
      "bounds": {
        "x": 896,
        "y": 3634,
        "width": 74,
        "height": 44
      },
      "visible": true,
      "parentPath": "3",
      "parentName": "VIP Weekly Free Game",
      "siblingIndex": 12,
      "siblingCount": 26,
      "siblingNames": [
        "Group 54",
        "Group 53",
        "Rectangle 1 copy 8",
        "Rectangle 10 copy 4",
        "Layer 51",
        "Norland",
        "Rectangle 10 copy 5",
        "Layer 52",
        "Vertigo 2",
        "Rectangle 11 copy 4",
        "Shape 8",
        "VR"
      ],
      "childNames": [],
      "textSamples": [],
      "reasons": [
        "通用名称",
        "同级重名"
      ]
    },
    {
      "path": "3/13",
      "layerId": "40",
      "currentName": "Rectangle 11 copy",
      "kind": "shape",
      "bounds": {
        "x": 993,
        "y": 3634,
        "width": 110,
        "height": 44
      },
      "visible": true,
      "parentPath": "3",
      "parentName": "VIP Weekly Free Game",
      "siblingIndex": 14,
      "siblingCount": 26,
      "siblingNames": [
        "Group 54",
        "Group 53",
        "Rectangle 1 copy 8",
        "Rectangle 10 copy 4",
        "Layer 51",
        "Norland",
        "Rectangle 10 copy 5",
        "Layer 52",
        "Vertigo 2",
        "Rectangle 11 copy 4",
        "Shape 8",
        "Rectangle 11"
      ],
      "childNames": [],
      "textSamples": [],
      "reasons": [
        "通用名称",
        "同级重名"
      ]
    },
    {
      "path": "3/15",
      "layerId": "42",
      "currentName": "Rectangle 11 copy 2",
      "kind": "shape",
      "bounds": {
        "x": 403,
        "y": 3634,
        "width": 126,
        "height": 44
      },
      "visible": true,
      "parentPath": "3",
      "parentName": "VIP Weekly Free Game",
      "siblingIndex": 16,
      "siblingCount": 26,
      "siblingNames": [
        "Group 54",
        "Group 53",
        "Rectangle 1 copy 8",
        "Rectangle 10 copy 4",
        "Layer 51",
        "Norland",
        "Rectangle 10 copy 5",
        "Layer 52",
        "Vertigo 2",
        "Rectangle 11 copy 4",
        "Shape 8",
        "Rectangle 11"
      ],
      "childNames": [],
      "textSamples": [],
      "reasons": [
        "通用名称",
        "同级重名"
      ]
    },
    {
      "path": "3/17",
      "layerId": "44",
      "currentName": "Rectangle 11 copy 3",
      "kind": "shape",
      "bounds": {
        "x": 553,
        "y": 3634,
        "width": 260,
        "height": 44
      },
      "visible": true,
      "parentPath": "3",
      "parentName": "VIP Weekly Free Game",
      "siblingIndex": 18,
      "siblingCount": 26,
      "siblingNames": [
        "Group 54",
        "Group 53",
        "Rectangle 1 copy 8",
        "Rectangle 10 copy 4",
        "Layer 51",
        "Norland",
        "Rectangle 10 copy 5",
        "Layer 52",
        "Vertigo 2",
        "Rectangle 11 copy 4",
        "Shape 8",
        "Rectangle 11"
      ],
      "childNames": [],
      "textSamples": [],
      "reasons": [
        "通用名称",
        "同级重名"
      ]
    },
    {
      "path": "3/19",
      "layerId": "46",
      "currentName": "Rectangle 11 copy 5",
      "kind": "shape",
      "bounds": {
        "x": 64,
        "y": 3634,
        "width": 120,
        "height": 44
      },
      "visible": true,
      "parentPath": "3",
      "parentName": "VIP Weekly Free Game",
      "siblingIndex": 20,
      "siblingCount": 26,
      "siblingNames": [
        "Group 54",
        "Group 53",
        "Rectangle 1 copy 8",
        "Rectangle 10 copy 4",
        "Layer 51",
        "Norland",
        "Rectangle 10 copy 5",
        "Layer 52",
        "Vertigo 2",
        "Rectangle 11 copy 4",
        "Shape 8",
        "Rectangle 11"
      ],
      "childNames": [],
      "textSamples": [],
      "reasons": [
        "通用名称",
        "同级重名"
      ]
    },
    {
      "path": "3/21",
      "layerId": "48",
      "currentName": "Rectangle 11 copy 7",
      "kind": "shape",
      "bounds": {
        "x": 208,
        "y": 3634,
        "width": 171,
        "height": 44
      },
      "visible": true,
      "parentPath": "3",
      "parentName": "VIP Weekly Free Game",
      "siblingIndex": 22,
      "siblingCount": 26,
      "siblingNames": [
        "Group 54",
        "Group 53",
        "Rectangle 1 copy 8",
        "Rectangle 10 copy 4",
        "Layer 51",
        "Norland",
        "Rectangle 10 copy 5",
        "Layer 52",
        "Vertigo 2",
        "Rectangle 11 copy 4",
        "Shape 8",
        "Rectangle 11"
      ],
      "childNames": [],
      "textSamples": [],
      "reasons": [
        "通用名称",
        "同级重名"
      ]
    },
    {
      "path": "3/24",
      "layerId": "51",
      "currentName": "Rectangle 1 copy 10",
      "kind": "shape",
      "bounds": {
        "x": 819,
        "y": 2946,
        "width": 360,
        "height": 64
      },
      "visible": true,
      "parentPath": "3",
      "parentName": "VIP Weekly Free Game",
      "siblingIndex": 25,
      "siblingCount": 26,
      "siblingNames": [
        "Group 54",
        "Group 53",
        "Rectangle 1 copy 8",
        "Rectangle 10 copy 4",
        "Layer 51",
        "Norland",
        "Rectangle 10 copy 5",
        "Layer 52",
        "Vertigo 2",
        "Rectangle 11 copy 4",
        "Shape 8",
        "Rectangle 11"
      ],
      "childNames": [],
      "textSamples": [],
      "reasons": [
        "通用名称",
        "同级重名"
      ]
    },
    {
      "path": "5/0/7",
      "layerId": "101",
      "currentName": "Rectangle 18 copy",
      "kind": "shape",
      "bounds": {
        "x": 65,
        "y": 902,
        "width": 361,
        "height": 65
      },
      "visible": true,
      "parentPath": "5/0",
      "parentName": "VIP",
      "siblingIndex": 8,
      "siblingCount": 9,
      "siblingNames": [
        "Rectangle 14 copy 4",
        "Rectangle 14 copy 5",
        "-s-VIP_pic",
        "about",
        "-s-VIP__icon",
        "-s-dis_icon",
        "-30%",
        "First Google Play"
      ],
      "childNames": [],
      "textSamples": [],
      "reasons": [
        "通用名称"
      ]
    },
    {
      "path": "5/1/5",
      "layerId": "119",
      "currentName": "Rectangle 18 copy 3",
      "kind": "shape",
      "bounds": {
        "x": 653,
        "y": 902,
        "width": 361,
        "height": 65
      },
      "visible": true,
      "parentPath": "5/1",
      "parentName": "Standard",
      "siblingIndex": 6,
      "siblingCount": 7,
      "siblingNames": [
        "Rectangle 14 copy 4",
        "Rectangle 14 copy 5",
        "-s-Standard_pic",
        "about",
        "-s-Standard_icon",
        "First Google Play"
      ],
      "childNames": [],
      "textSamples": [],
      "reasons": [
        "通用名称"
      ]
    },
    {
      "path": "5/2/3/0",
      "layerId": "128",
      "currentName": "Rectangle 23",
      "kind": "shape",
      "bounds": {
        "x": 422,
        "y": 1969,
        "width": 169,
        "height": 43
      },
      "visible": true,
      "parentPath": "5/2/3",
      "parentName": "about",
      "siblingIndex": 1,
      "siblingCount": 7,
      "siblingNames": [
        "Limited",
        "-s-购买 copy",
        "12,000",
        "10,000",
        "IQD",
        "Essential  / 60mins"
      ],
      "childNames": [],
      "textSamples": [],
      "reasons": [
        "通用名称"
      ]
    },
    {
      "path": "5/3/7",
      "layerId": "174",
      "currentName": "Rectangle 18 copy 5",
      "kind": "shape",
      "bounds": {
        "x": 653,
        "y": 1548,
        "width": 361,
        "height": 65
      },
      "visible": true,
      "parentPath": "5/3",
      "parentName": "3h",
      "siblingIndex": 8,
      "siblingCount": 9,
      "siblingNames": [
        "Rectangle 14 copy 4",
        "Rectangle 14 copy 5",
        "-s-nt5_pic",
        "about",
        "-s-3_icon",
        "Group 75",
        "-s-most popular",
        "First Google Play copy"
      ],
      "childNames": [],
      "textSamples": [],
      "reasons": [
        "通用名称"
      ]
    },
    {
      "path": "5/6/0/0",
      "layerId": "218",
      "currentName": "Rectangle 14 copy 2",
      "kind": "shape",
      "bounds": {
        "x": 65,
        "y": 759,
        "width": 128,
        "height": 65
      },
      "visible": true,
      "parentPath": "5/6/0",
      "parentName": "select",
      "siblingIndex": 1,
      "siblingCount": 9,
      "siblingNames": [
        "All",
        "VIP Packages",
        "Monthly Packages",
        "Hour Packages",
        "Unlimited Play",
        "Queue Pass",
        "High-Definition",
        "Limited Purchase"
      ],
      "childNames": [],
      "textSamples": [],
      "reasons": [
        "通用名称"
      ]
    },
    {
      "path": "5/8",
      "layerId": "230",
      "currentName": "Group 60 copy",
      "kind": "group",
      "bounds": null,
      "visible": true,
      "parentPath": "5",
      "parentName": "about",
      "siblingIndex": 9,
      "siblingCount": 10,
      "siblingNames": [
        "VIP",
        "Standard",
        "Essential",
        "3h",
        "5h",
        "10h",
        "select",
        "Group 60",
        "Purchase Packages"
      ],
      "childNames": [
        "Shape 6 copy",
        "Shape 6 copy 2"
      ],
      "textSamples": [],
      "layout": {
        "direction": "stack",
        "gap": null,
        "align": "mixed"
      },
      "reasons": [
        "通用名称",
        "同级重名"
      ]
    },
    {
      "path": "5/8/0",
      "layerId": "231",
      "currentName": "Shape 6 copy",
      "kind": "shape",
      "bounds": null,
      "visible": true,
      "parentPath": "5/8",
      "parentName": "Group 60 copy",
      "siblingIndex": 1,
      "siblingCount": 2,
      "siblingNames": [
        "Shape 6 copy 2"
      ],
      "childNames": [],
      "textSamples": [],
      "reasons": [
        "通用名称",
        "同级重名"
      ]
    },
    {
      "path": "5/8/1",
      "layerId": "232",
      "currentName": "Shape 6 copy 2",
      "kind": "shape",
      "bounds": null,
      "visible": true,
      "parentPath": "5/8",
      "parentName": "Group 60 copy",
      "siblingIndex": 2,
      "siblingCount": 2,
      "siblingNames": [
        "Shape 6 copy"
      ],
      "childNames": [],
      "textSamples": [],
      "reasons": [
        "通用名称",
        "同级重名"
      ]
    },
    {
      "path": "7/0/0",
      "layerId": "239",
      "currentName": "Ellipse 5",
      "kind": "shape",
      "bounds": {
        "x": 64,
        "y": 314,
        "width": 240,
        "height": 240
      },
      "visible": true,
      "parentPath": "7/0",
      "parentName": "head",
      "siblingIndex": 1,
      "siblingCount": 3,
      "siblingNames": [
        "Layer 49",
        "Layer 60"
      ],
      "childNames": [],
      "textSamples": [],
      "reasons": [
        "通用名称"
      ]
    },
    {
      "path": "8/1/1/2",
      "layerId": "256",
      "currentName": "Ellipse 3 copy 2",
      "kind": "shape",
      "bounds": {
        "x": 1122,
        "y": 192,
        "width": 25,
        "height": 7
      },
      "visible": true,
      "parentPath": "8/1/1",
      "parentName": "-s-message",
      "siblingIndex": 3,
      "siblingCount": 3,
      "siblingNames": [
        "-slice-",
        "Shape 7"
      ],
      "childNames": [],
      "textSamples": [],
      "reasons": [
        "通用名称"
      ]
    }
  ],
  "mergeCandidates": [
    {
      "path": "4",
      "kind": "badge",
      "suggestedName": "badge-group-merged",
      "bounds": {
        "x": 0,
        "y": 5740,
        "width": 1242,
        "height": 250
      },
      "areaRatio": 0.042,
      "layout": {
        "direction": "stack",
        "gap": null,
        "align": "mixed"
      },
      "memberCount": 5,
      "memberKinds": [
        {
          "kind": "shape",
          "count": 13
        },
        {
          "kind": "group",
          "count": 8
        },
        {
          "kind": "text",
          "count": 4
        }
      ],
      "textDescendantCount": 4,
      "nestedGroupCount": 8,
      "reason": "5 个可见子图层集中在 1242×250 区域（占画布 4.2%），结构角色：角标组（包含 4 个角标/图标组件）；建议合并为单层素材"
    },
    {
      "path": "5/0",
      "kind": "component",
      "suggestedName": "form-row-merged",
      "bounds": {
        "x": 65,
        "y": 900,
        "width": 565,
        "height": 582
      },
      "areaRatio": 0.044,
      "layout": {
        "direction": "stack",
        "gap": null,
        "align": "mixed"
      },
      "memberCount": 9,
      "memberKinds": [
        {
          "kind": "shape",
          "count": 8
        },
        {
          "kind": "text",
          "count": 6
        },
        {
          "kind": "group",
          "count": 5
        },
        {
          "kind": "pixel",
          "count": 3
        }
      ],
      "textDescendantCount": 6,
      "nestedGroupCount": 5,
      "reason": "9 个可见子图层集中在 565×582 区域（占画布 4.4%），结构角色：表单行（2 个文本与 3 个控件并排）；建议合并为单层素材"
    },
    {
      "path": "5/1",
      "kind": "component",
      "suggestedName": "card-merged",
      "bounds": {
        "x": 653,
        "y": 900,
        "width": 527,
        "height": 582
      },
      "areaRatio": 0.041,
      "layout": {
        "direction": "stack",
        "gap": null,
        "align": "mixed"
      },
      "memberCount": 7,
      "memberKinds": [
        {
          "kind": "shape",
          "count": 6
        },
        {
          "kind": "group",
          "count": 4
        },
        {
          "kind": "text",
          "count": 4
        },
        {
          "kind": "pixel",
          "count": 3
        }
      ],
      "textDescendantCount": 4,
      "nestedGroupCount": 4,
      "reason": "7 个可见子图层集中在 527×582 区域（占画布 4.1%），结构角色：卡片（带背景的 7 元素容器）；建议合并为单层素材"
    },
    {
      "path": "5/2",
      "kind": "component",
      "suggestedName": "card-merged-2",
      "bounds": {
        "x": 65,
        "y": 1546,
        "width": 527,
        "height": 582
      },
      "areaRatio": 0.041,
      "layout": {
        "direction": "stack",
        "gap": null,
        "align": "mixed"
      },
      "memberCount": 8,
      "memberKinds": [
        {
          "kind": "shape",
          "count": 9
        },
        {
          "kind": "group",
          "count": 6
        },
        {
          "kind": "text",
          "count": 6
        },
        {
          "kind": "pixel",
          "count": 4
        }
      ],
      "textDescendantCount": 6,
      "nestedGroupCount": 6,
      "reason": "8 个可见子图层集中在 527×582 区域（占画布 4.1%），结构角色：卡片（带背景的 9 元素容器）；建议合并为单层素材"
    },
    {
      "path": "5/3",
      "kind": "component",
      "suggestedName": "card-merged-3",
      "bounds": {
        "x": 653,
        "y": 1518,
        "width": 595,
        "height": 610
      },
      "areaRatio": 0.049,
      "layout": {
        "direction": "stack",
        "gap": null,
        "align": "mixed"
      },
      "memberCount": 8,
      "memberKinds": [
        {
          "kind": "shape",
          "count": 7
        },
        {
          "kind": "group",
          "count": 5
        },
        {
          "kind": "pixel",
          "count": 4
        },
        {
          "kind": "text",
          "count": 4
        }
      ],
      "textDescendantCount": 4,
      "nestedGroupCount": 5,
      "reason": "8 个可见子图层集中在 595×610 区域（占画布 4.9%），结构角色：卡片（带背景的 9 元素容器）；建议合并为单层素材"
    },
    {
      "path": "5/4",
      "kind": "component",
      "suggestedName": "card-merged-4",
      "bounds": {
        "x": 64,
        "y": 2161,
        "width": 527,
        "height": 610
      },
      "areaRatio": 0.043,
      "layout": {
        "direction": "stack",
        "gap": null,
        "align": "mixed"
      },
      "memberCount": 5,
      "memberKinds": [
        {
          "kind": "shape",
          "count": 5
        },
        {
          "kind": "group",
          "count": 4
        },
        {
          "kind": "pixel",
          "count": 3
        },
        {
          "kind": "text",
          "count": 3
        }
      ],
      "textDescendantCount": 3,
      "nestedGroupCount": 4,
      "reason": "5 个可见子图层集中在 527×610 区域（占画布 4.3%），结构角色：卡片（带背景的 5 元素容器）；建议合并为单层素材"
    },
    {
      "path": "5/5",
      "kind": "component",
      "suggestedName": "card-merged-5",
      "bounds": {
        "x": 652,
        "y": 2161,
        "width": 530,
        "height": 610
      },
      "areaRatio": 0.043,
      "layout": {
        "direction": "stack",
        "gap": null,
        "align": "mixed"
      },
      "memberCount": 8,
      "memberKinds": [
        {
          "kind": "shape",
          "count": 8
        },
        {
          "kind": "group",
          "count": 6
        },
        {
          "kind": "text",
          "count": 5
        },
        {
          "kind": "pixel",
          "count": 4
        }
      ],
      "textDescendantCount": 5,
      "nestedGroupCount": 6,
      "reason": "8 个可见子图层集中在 530×610 区域（占画布 4.3%），结构角色：卡片（带背景的 8 元素容器）；建议合并为单层素材"
    },
    {
      "path": "7",
      "kind": "component",
      "suggestedName": "component-merged",
      "bounds": {
        "x": 0,
        "y": 211,
        "width": 937,
        "height": 432
      },
      "areaRatio": 0.054,
      "layout": {
        "direction": "stack",
        "gap": null,
        "align": "mixed"
      },
      "memberCount": 5,
      "memberKinds": [
        {
          "kind": "shape",
          "count": 4
        },
        {
          "kind": "text",
          "count": 3
        },
        {
          "kind": "group",
          "count": 2
        },
        {
          "kind": "pixel",
          "count": 2
        }
      ],
      "textDescendantCount": 3,
      "nestedGroupCount": 2,
      "reason": "5 个可见子图层集中在 937×432 区域（占画布 5.4%），结构角色：区块（页面级容器，包含 5 个元素）；建议合并为单层素材"
    },
    {
      "path": "8/1",
      "kind": "badge",
      "suggestedName": "badge-merged",
      "bounds": {
        "x": 1076,
        "y": 138,
        "width": 114,
        "height": 113
      },
      "areaRatio": 0.002,
      "layout": {
        "direction": "stack",
        "gap": null,
        "align": "mixed"
      },
      "memberCount": 4,
      "memberKinds": [
        {
          "kind": "shape",
          "count": 5
        },
        {
          "kind": "group",
          "count": 1
        },
        {
          "kind": "text",
          "count": 1
        }
      ],
      "textDescendantCount": 1,
      "nestedGroupCount": 1,
      "reason": "4 个可见子图层集中在 114×113 区域（占画布 0.2%），结构角色：角标（小尺寸组件，占画布 0.2%）；建议合并为单层素材"
    },
    {
      "path": "8/2",
      "kind": "component",
      "suggestedName": "icon-button-merged",
      "bounds": {
        "x": 919,
        "y": 141,
        "width": 110,
        "height": 110
      },
      "areaRatio": 0.002,
      "layout": {
        "direction": "stack",
        "gap": null,
        "align": "center"
      },
      "memberCount": 2,
      "memberKinds": [
        {
          "kind": "shape",
          "count": 4
        },
        {
          "kind": "group",
          "count": 1
        }
      ],
      "textDescendantCount": 0,
      "nestedGroupCount": 1,
      "reason": "2 个可见子图层集中在 110×110 区域（占画布 0.2%），结构角色：图标按钮（无文本方形控件组 110×110）；建议合并为单层素材"
    }
  ]
}
```

## 输出格式
```json
{
  "schema": "layerforge.ai-naming.response",
  "schemaVersion": "0.2.0",
  "renames": [
    {
      "path": "1",
      "newName": "example-name",
      "reason": "依据该图层的文本与父级命名"
    }
  ],
  "merges": [
    {
      "path": "4",
      "decision": "merge",
      "name": "example-component",
      "reason": "子层属于同一紧凑控件，适合栅格化为单层"
    }
  ]
}
```

将上述 JSON 保存为 `.json` 文件后导入 PSD Normalize Studio 审核。