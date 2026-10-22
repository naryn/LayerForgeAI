# PSD 图层语义命名与合并复核任务

你正在为一份 PSD 生成图层命名和合并复核计划。请只输出计划 JSON，不要生成代码或修改文件。

## 文档
- 项目：ai-merge-detial-d-0708
- 源文件：Detial_D_0708.psd
- 画布：1242×2718
- 图层总数：71
- 命名候选数：1
- 合并复核候选数：6
- 生成时间：2026-10-22T10:48:11.347Z

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
- 0 [pixel] "2"
- 1 [pixel] "Layer 1"
- 2 [shape] "Rectangle 5 copy 4"
- 3 [group] "Buy Now" (2 子层)
  - 3/0 [shape] "Rectangle 16 copy 2"
  - 3/1 [text] "Buy Now"
- 4 [group] "Group 76" (6 子层)
  - 4/0 [text] "120-hours gaming credits Validity period: 30 days Enjoy gaming"
  - 4/1 [pixel] "villable copy 3"
  - 4/2 [pixel] "villable copy 2"
  - 4/3 [pixel] "villable copy"
  - 4/4 [pixel] "villable"
  - 4/5 [group] "-s-villable" (3 子层)
    - 4/5/0 [shape] "-slice-"
    - 4/5/1 [shape] "Ellipse 8"
    - 4/5/2 [shape] "Shape 17"
- 5 [group] "Group 77" (5 子层)
  - 5/0 [group] "prolonged" (2 子层)
    - 5/0/0 [text] "prolonged"
    - 5/0/1 [group] "-s-Prolonged" (2 子层)
      - 5/0/1/0 [shape] "-slice-"
      - 5/0/1/1 [pixel] "AFK"
  - 5/1 [group] "Free Games" (2 子层)
    - 5/1/0 [text] "Free"
    - 5/1/1 [group] "-s-Free" (2 子层)
      - 5/1/1/0 [shape] "-slice-"
      - 5/1/1/1 [pixel] "Free"
  - 5/2 [group] "Priority Queue" (2 子层)
    - 5/2/0 [text] "Queue"
    - 5/2/1 [group] "-s-Queue" (2 子层)
      - 5/2/1/0 [shape] "-slice-"
      - 5/2/1/1 [pixel] "Shape 12 copy 2"
  - 5/3 [group] "Exclusive Games" (2 子层)
    - 5/3/0 [text] "Exclusive"
    - 5/3/1 [group] "-s-Exclusive" (2 子层)
      - 5/3/1/0 [shape] "-slice-"
      - 5/3/1/1 [pixel] "Vip"
  - 5/4 [group] "HD Graphics" (2 子层)
    - 5/4/0 [text] "HD"
    - 5/4/1 [group] "-s-HD" (2 子层)
      - 5/4/1/0 [shape] "-slice-"
      - 5/4/1/1 [pixel] "Rectangle 15 copy 6"
- 6 [group] "VIP" (9 子层)
  - 6/0 [shape] "Rectangle 14 copy 4"
  - 6/1 [shape] "Rectangle 14 copy 5"
  - 6/2 [group] "-s-VIP_pic" (2 子层)
    - 6/2/0 [shape] "-slice-"
    - 6/2/1 [pixel] "图层 1 拷贝"
  - 6/3 [group] "about" (5 子层)
    - 6/3/0 [group] "-s-购买" (2 子层)
      - 6/3/0/0 [shape] "-slice-"
      - 6/3/0/1 [pixel] "购买"
    - 6/3/1 [text] "28,000"
    - 6/3/2 [text] "25,000"
    - 6/3/3 [text] "IQD"
    - 6/3/4 [text] "VIP / 120mins"
  - 6/4 [group] "-s-VIP__icon" (2 子层)
    - 6/4/0 [shape] "-slice-"
    - 6/4/1 [pixel] "图层 1 拷贝"
  - 6/5 [group] "-s-dis_icon" (2 子层)
    - 6/5/0 [shape] "-slice-"
    - 6/5/1 [shape] "dis_icon"
  - 6/6 [text] "-30%"
  - 6/7 [shape] "Rectangle 18 copy"
  - 6/8 [text] "First Google Play"
- 7 [text] "VIP"
- 8 [group] "-s-Close" (4 子层)
  - 8/0 [shape] "-slice-"
  - 8/1 [shape] "Ellipse 1"
  - 8/2 [shape] "Shape 1"
  - 8/3 [shape] "Shape 1 copy"
```

## 候选（JSON）
```json
{
  "schema": "layerforge.ai-naming.request",
  "schemaVersion": "0.2.0",
  "generatedAt": "2026-10-22T10:48:11.347Z",
  "project": {
    "name": "ai-merge-detial-d-0708",
    "sourceFileName": "Detial_D_0708.psd",
    "width": 1242,
    "height": 2718,
    "layerCount": 71
  },
  "candidates": [
    {
      "path": "6/7",
      "layerId": "64",
      "currentName": "Rectangle 18 copy",
      "kind": "shape",
      "bounds": {
        "x": 357,
        "y": 932,
        "width": 363,
        "height": 67
      },
      "visible": true,
      "parentPath": "6",
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
    }
  ],
  "mergeCandidates": [
    {
      "path": "3",
      "kind": "component",
      "suggestedName": "button-merged",
      "bounds": {
        "x": 62,
        "y": 2405,
        "width": 1118,
        "height": 155
      },
      "areaRatio": 0.051,
      "layout": {
        "direction": "stack",
        "gap": null,
        "align": "center"
      },
      "memberCount": 2,
      "memberKinds": [
        {
          "kind": "shape",
          "count": 1
        },
        {
          "kind": "text",
          "count": 1
        }
      ],
      "textDescendantCount": 1,
      "nestedGroupCount": 0,
      "reason": "2 个可见子图层集中在 1118×155 区域（占画布 5.1%），结构角色：按钮（文本+背景形状，横向 1118×155）；建议合并为单层素材"
    },
    {
      "path": "4",
      "kind": "component",
      "suggestedName": "checkbox-row-merged",
      "bounds": {
        "x": 87,
        "y": 1891,
        "width": 540,
        "height": 423
      },
      "areaRatio": 0.068,
      "layout": {
        "direction": "stack",
        "gap": null,
        "align": "mixed"
      },
      "memberCount": 6,
      "memberKinds": [
        {
          "kind": "pixel",
          "count": 4
        },
        {
          "kind": "shape",
          "count": 3
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
      "reason": "6 个可见子图层集中在 540×423 区域（占画布 6.8%），结构角色：勾选行（小方形控件 52×52 与文本同行）；建议合并为单层素材"
    },
    {
      "path": "5",
      "kind": "component",
      "suggestedName": "component-merged",
      "bounds": {
        "x": 86,
        "y": 1590,
        "width": 1064,
        "height": 213
      },
      "areaRatio": 0.067,
      "layout": {
        "direction": "stack",
        "gap": null,
        "align": "mixed"
      },
      "memberCount": 5,
      "memberKinds": [
        {
          "kind": "group",
          "count": 10
        },
        {
          "kind": "pixel",
          "count": 5
        },
        {
          "kind": "shape",
          "count": 5
        },
        {
          "kind": "text",
          "count": 5
        }
      ],
      "textDescendantCount": 5,
      "nestedGroupCount": 10,
      "reason": "5 个可见子图层集中在 1064×213 区域（占画布 6.7%），结构角色：区块（页面级容器，包含 5 个元素）；建议合并为单层素材"
    },
    {
      "path": "6/3",
      "kind": "component",
      "suggestedName": "component-merged",
      "bounds": {
        "x": 404,
        "y": 1281,
        "width": 279,
        "height": 190
      },
      "areaRatio": 0.016,
      "layout": {
        "direction": "stack",
        "gap": null,
        "align": "mixed"
      },
      "memberCount": 4,
      "memberKinds": [
        {
          "kind": "text",
          "count": 4
        }
      ],
      "textDescendantCount": 4,
      "nestedGroupCount": 0,
      "reason": "4 个可见子图层集中在 279×190 区域（占画布 1.6%），结构角色：区块（页面级容器，包含 5 个元素）；建议合并为单层素材"
    },
    {
      "path": "6/4",
      "kind": "component",
      "suggestedName": "icon-button-merged",
      "bounds": {
        "x": 530,
        "y": 1045,
        "width": 182,
        "height": 182
      },
      "areaRatio": 0.01,
      "layout": {
        "direction": "stack",
        "gap": null,
        "align": "center"
      },
      "memberCount": 2,
      "memberKinds": [
        {
          "kind": "pixel",
          "count": 1
        },
        {
          "kind": "shape",
          "count": 1
        }
      ],
      "textDescendantCount": 0,
      "nestedGroupCount": 0,
      "reason": "2 个可见子图层集中在 182×182 区域（占画布 1.0%），结构角色：图标按钮（无文本方形控件组 182×182）；建议合并为单层素材"
    },
    {
      "path": "8",
      "kind": "component",
      "suggestedName": "icon-button-merged",
      "bounds": {
        "x": 1067,
        "y": 593,
        "width": 112,
        "height": 113
      },
      "areaRatio": 0.004,
      "layout": {
        "direction": "stack",
        "gap": null,
        "align": "center"
      },
      "memberCount": 3,
      "memberKinds": [
        {
          "kind": "shape",
          "count": 3
        }
      ],
      "textDescendantCount": 0,
      "nestedGroupCount": 0,
      "reason": "3 个可见子图层集中在 112×113 区域（占画布 0.4%），结构角色：图标按钮（无文本方形控件组 114×115）；建议合并为单层素材"
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
      "path": "6/7",
      "newName": "example-name",
      "reason": "依据该图层的文本与父级命名"
    }
  ],
  "merges": [
    {
      "path": "3",
      "decision": "merge",
      "name": "example-component",
      "reason": "子层属于同一紧凑控件，适合栅格化为单层"
    }
  ]
}
```

将上述 JSON 保存为 `.json` 文件后导入 PSD Normalize Studio 审核。