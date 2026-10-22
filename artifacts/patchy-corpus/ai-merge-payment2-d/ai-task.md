# PSD 图层语义命名与合并复核任务

你正在为一份 PSD 生成图层命名和合并复核计划。请只输出计划 JSON，不要生成代码或修改文件。

## 文档
- 项目：ai-merge-payment2-d
- 源文件：Payment2_D.psd
- 画布：1242×2718
- 图层总数：69
- 命名候选数：2
- 合并复核候选数：10
- 生成时间：2026-10-22T10:45:09.196Z

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
- 3 [group] "Pay Now" (2 子层)
  - 3/0 [shape] "Rectangle 16 copy 2"
  - 3/1 [text] "Pay Now"
- 4 [group] "agree" (3 子层)
  - 4/0 [shape] "Rectangle 18"
  - 4/1 [shape] "Shape 18"
  - 4/2 [text] "I have readed and agree Membership Service Agreement"
- 5 [text] "25,000"
- 6 [text] "28,000"
- 7 [text] "Total Cost IQD"
- 8 [group] "Promo Code" (5 子层)
  - 8/0 [shape] "Rectangle 1 copy 12"
  - 8/1 [text] "SIMSIM13H13821G8"
  - 8/2 [text] "-50 off"
  - 8/3 [shape] "Rectangle 1 copy 13"
  - 8/4 [text] "Verify"
- 9 [group] "Payment Method" (7 子层)
  - 9/0 [text] "Payment Method"
  - 9/1 [text] "(Visa & Mastercard accepted)"
  - 9/2 [group] "1" (3 子层)
    - 9/2/0 [shape] "Rectangle 1 copy 11"
    - 9/2/1 [group] "-s-AsiaPay" (2 子层)
      - 9/2/1/0 [shape] "-slice-"
      - 9/2/1/1 [pixel] "AsiaPay"
    - 9/2/2 [text] "Asia Pay"
  - 9/3 [group] "2" (4 子层)
    - 9/3/0 [shape] "Rectangle 1 copy 11"
    - 9/3/1 [group] "-s-villable" (3 子层)
      - 9/3/1/0 [shape] "-slice-"
      - 9/3/1/1 [shape] "Ellipse 8"
      - 9/3/1/2 [shape] "Shape 17"
    - 9/3/2 [group] "-s-QICard" (2 子层)
      - 9/3/2/0 [shape] "-slice-"
      - 9/3/2/1 [pixel] "QICard"
    - 9/3/3 [text] "QI Card"
  - 9/4 [group] "3" (3 子层)
    - 9/4/0 [shape] "Rectangle 1 copy 11"
    - 9/4/1 [group] "-s-ZainCash" (2 子层)
      - 9/4/1/0 [shape] "-slice-"
      - 9/4/1/1 [pixel] "ZainCash"
    - 9/4/2 [text] "Zain Cash"
  - 9/5 [group] "4" (3 子层)
    - 9/5/0 [shape] "Rectangle 1 copy 11"
    - 9/5/1 [group] "-s-FastPay" (2 子层)
      - 9/5/1/0 [shape] "-slice-"
      - 9/5/1/1 [pixel] "FastPay"
    - 9/5/2 [text] "Fast Pay"
  - 9/6 [group] "5" (3 子层)
    - 9/6/0 [shape] "Rectangle 1 copy 11"
    - 9/6/1 [group] "-s-Areeba" (2 子层)
      - 9/6/1/0 [shape] "-slice-"
      - 9/6/1/1 [pixel] "Areeba"
    - 9/6/2 [text] "Areeba"
- 10 [group] "Selected" (3 子层)
  - 10/0 [text] "VIP"
  - 10/1 [group] "-s-villable" (3 子层)
    - 10/1/0 [shape] "-slice-"
    - 10/1/1 [shape] "Ellipse 8"
    - 10/1/2 [shape] "Shape 17"
  - 10/2 [text] "Selected"
- 11 [text] "Payment Method"
- 12 [group] "-s-Close" (4 子层)
  - 12/0 [shape] "-slice-"
  - 12/1 [shape] "Ellipse 1"
  - 12/2 [shape] "Shape 1"
  - 12/3 [shape] "Shape 1 copy"
```

## 候选（JSON）
```json
{
  "schema": "layerforge.ai-naming.request",
  "schemaVersion": "0.2.0",
  "generatedAt": "2026-10-22T10:45:09.196Z",
  "project": {
    "name": "ai-merge-payment2-d",
    "sourceFileName": "Payment2_D.psd",
    "width": 1242,
    "height": 2718,
    "layerCount": 69
  },
  "candidates": [
    {
      "path": "8/0",
      "layerId": "15",
      "currentName": "Rectangle 1 copy 12",
      "kind": "shape",
      "bounds": {
        "x": 58,
        "y": 1812,
        "width": 837,
        "height": 131
      },
      "visible": true,
      "parentPath": "8",
      "parentName": "Promo Code",
      "siblingIndex": 1,
      "siblingCount": 5,
      "siblingNames": [
        "SIMSIM13H13821G8",
        "-50 off",
        "Rectangle 1 copy 13",
        "Verify"
      ],
      "childNames": [],
      "textSamples": [],
      "reasons": [
        "通用名称",
        "同级重名"
      ]
    },
    {
      "path": "8/3",
      "layerId": "18",
      "currentName": "Rectangle 1 copy 13",
      "kind": "shape",
      "bounds": {
        "x": 941,
        "y": 1812,
        "width": 239,
        "height": 131
      },
      "visible": true,
      "parentPath": "8",
      "parentName": "Promo Code",
      "siblingIndex": 4,
      "siblingCount": 5,
      "siblingNames": [
        "Rectangle 1 copy 12",
        "SIMSIM13H13821G8",
        "-50 off",
        "Verify"
      ],
      "childNames": [],
      "textSamples": [],
      "reasons": [
        "通用名称",
        "同级重名"
      ]
    }
  ],
  "mergeCandidates": [
    {
      "path": "10",
      "kind": "component",
      "suggestedName": "component-merged",
      "bounds": {
        "x": 63,
        "y": 961,
        "width": 168,
        "height": 133
      },
      "areaRatio": 0.007,
      "layout": {
        "direction": "stack",
        "gap": null,
        "align": "mixed"
      },
      "memberCount": 3,
      "memberKinds": [
        {
          "kind": "shape",
          "count": 3
        },
        {
          "kind": "text",
          "count": 2
        },
        {
          "kind": "group",
          "count": 1
        }
      ],
      "textDescendantCount": 2,
      "nestedGroupCount": 1,
      "reason": "3 个可见子图层集中在 168×133 区域（占画布 0.7%），子层包含文本且边界紧凑；建议合并为单层素材"
    },
    {
      "path": "12",
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
    },
    {
      "path": "3",
      "kind": "component",
      "suggestedName": "button-merged",
      "bounds": {
        "x": 62,
        "y": 2277,
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
        "x": 64,
        "y": 2478,
        "width": 1064,
        "height": 48
      },
      "areaRatio": 0.015,
      "layout": {
        "direction": "stack",
        "gap": null,
        "align": "mixed"
      },
      "memberCount": 3,
      "memberKinds": [
        {
          "kind": "shape",
          "count": 2
        },
        {
          "kind": "text",
          "count": 1
        }
      ],
      "textDescendantCount": 1,
      "nestedGroupCount": 0,
      "reason": "3 个可见子图层集中在 1064×48 区域（占画布 1.5%），结构角色：勾选行（小方形控件 48×48 与文本同行）；建议合并为单层素材"
    },
    {
      "path": "8",
      "kind": "component",
      "suggestedName": "form-row-merged",
      "bounds": {
        "x": 58,
        "y": 1812,
        "width": 1122,
        "height": 131
      },
      "areaRatio": 0.044,
      "layout": {
        "direction": "stack",
        "gap": null,
        "align": "mixed"
      },
      "memberCount": 5,
      "memberKinds": [
        {
          "kind": "text",
          "count": 3
        },
        {
          "kind": "shape",
          "count": 2
        }
      ],
      "textDescendantCount": 3,
      "nestedGroupCount": 0,
      "reason": "5 个可见子图层集中在 1122×131 区域（占画布 4.4%），结构角色：表单行（3 个文本与 2 个控件并排）；建议合并为单层素材"
    },
    {
      "path": "9/2",
      "kind": "component",
      "suggestedName": "button-merged",
      "bounds": {
        "x": 58,
        "y": 1245,
        "width": 528,
        "height": 143
      },
      "areaRatio": 0.022,
      "layout": {
        "direction": "stack",
        "gap": null,
        "align": "mixed"
      },
      "memberCount": 3,
      "memberKinds": [
        {
          "kind": "shape",
          "count": 2
        },
        {
          "kind": "group",
          "count": 1
        },
        {
          "kind": "pixel",
          "count": 1
        },
        {
          "kind": "text",
          "count": 1
        }
      ],
      "textDescendantCount": 1,
      "nestedGroupCount": 1,
      "reason": "3 个可见子图层集中在 528×143 区域（占画布 2.2%），结构角色：按钮（文本+背景形状，横向 528×143）；建议合并为单层素材"
    },
    {
      "path": "9/3",
      "kind": "component",
      "suggestedName": "button-merged-2",
      "bounds": {
        "x": 652,
        "y": 1245,
        "width": 528,
        "height": 143
      },
      "areaRatio": 0.022,
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
          "count": 2
        },
        {
          "kind": "pixel",
          "count": 1
        },
        {
          "kind": "text",
          "count": 1
        }
      ],
      "textDescendantCount": 1,
      "nestedGroupCount": 2,
      "reason": "4 个可见子图层集中在 528×143 区域（占画布 2.2%），结构角色：按钮（文本+背景形状，横向 528×143）；建议合并为单层素材"
    },
    {
      "path": "9/4",
      "kind": "component",
      "suggestedName": "button-merged-3",
      "bounds": {
        "x": 58,
        "y": 1419,
        "width": 528,
        "height": 143
      },
      "areaRatio": 0.022,
      "layout": {
        "direction": "stack",
        "gap": null,
        "align": "mixed"
      },
      "memberCount": 3,
      "memberKinds": [
        {
          "kind": "shape",
          "count": 2
        },
        {
          "kind": "group",
          "count": 1
        },
        {
          "kind": "pixel",
          "count": 1
        },
        {
          "kind": "text",
          "count": 1
        }
      ],
      "textDescendantCount": 1,
      "nestedGroupCount": 1,
      "reason": "3 个可见子图层集中在 528×143 区域（占画布 2.2%），结构角色：按钮（文本+背景形状，横向 528×143）；建议合并为单层素材"
    },
    {
      "path": "9/5",
      "kind": "component",
      "suggestedName": "button-merged-4",
      "bounds": {
        "x": 651,
        "y": 1420,
        "width": 528,
        "height": 143
      },
      "areaRatio": 0.022,
      "layout": {
        "direction": "stack",
        "gap": null,
        "align": "mixed"
      },
      "memberCount": 3,
      "memberKinds": [
        {
          "kind": "shape",
          "count": 2
        },
        {
          "kind": "group",
          "count": 1
        },
        {
          "kind": "pixel",
          "count": 1
        },
        {
          "kind": "text",
          "count": 1
        }
      ],
      "textDescendantCount": 1,
      "nestedGroupCount": 1,
      "reason": "3 个可见子图层集中在 528×143 区域（占画布 2.2%），结构角色：按钮（文本+背景形状，横向 528×143）；建议合并为单层素材"
    },
    {
      "path": "9/6",
      "kind": "component",
      "suggestedName": "button-merged-5",
      "bounds": {
        "x": 59,
        "y": 1594,
        "width": 528,
        "height": 143
      },
      "areaRatio": 0.022,
      "layout": {
        "direction": "stack",
        "gap": null,
        "align": "mixed"
      },
      "memberCount": 3,
      "memberKinds": [
        {
          "kind": "shape",
          "count": 2
        },
        {
          "kind": "group",
          "count": 1
        },
        {
          "kind": "pixel",
          "count": 1
        },
        {
          "kind": "text",
          "count": 1
        }
      ],
      "textDescendantCount": 1,
      "nestedGroupCount": 1,
      "reason": "3 个可见子图层集中在 528×143 区域（占画布 2.2%），结构角色：按钮（文本+背景形状，横向 528×143）；建议合并为单层素材"
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
      "path": "8/0",
      "newName": "example-name",
      "reason": "依据该图层的文本与父级命名"
    }
  ],
  "merges": [
    {
      "path": "10",
      "decision": "merge",
      "name": "example-component",
      "reason": "子层属于同一紧凑控件，适合栅格化为单层"
    }
  ]
}
```

将上述 JSON 保存为 `.json` 文件后导入 PSD Normalize Studio 审核。