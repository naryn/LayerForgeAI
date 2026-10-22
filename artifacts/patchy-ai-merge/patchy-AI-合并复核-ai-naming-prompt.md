# PSD 图层语义命名与合并复核任务

你正在为一份 PSD 生成图层命名和合并复核计划。请只输出计划 JSON，不要生成代码或修改文件。

## 文档
- 项目：patchy AI 合并复核
- 源文件：patchy-group-merge.psd
- 画布：160×100
- 图层总数：8
- 命名候选数：0
- 合并复核候选数：1
- 生成时间：2026-10-22T11:07:26.928Z

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
- 0 [pixel] "page-background"
- 1 [pixel] "hero-title"
- 2 [pixel] "hero-cta"
- 3 [pixel] "icon-star"
- 4 [pixel] "icon-heart"
- 5 [group] "badge" (2 子层)
  - 5/0 [pixel] "badge-count"
  - 5/1 [pixel] "badge-icon"
```

## 候选（JSON）
```json
{
  "schema": "layerforge.ai-naming.request",
  "schemaVersion": "0.2.0",
  "generatedAt": "2026-10-22T11:07:26.928Z",
  "project": {
    "name": "patchy AI 合并复核",
    "sourceFileName": "patchy-group-merge.psd",
    "width": 160,
    "height": 100,
    "layerCount": 8
  },
  "candidates": [],
  "mergeCandidates": [
    {
      "path": "5",
      "kind": "component",
      "suggestedName": "icon-button-merged",
      "bounds": {
        "x": 120,
        "y": 70,
        "width": 14,
        "height": 12
      },
      "areaRatio": 0.011,
      "layout": {
        "direction": "stack",
        "gap": null,
        "align": "mixed"
      },
      "memberCount": 2,
      "memberKinds": [
        {
          "kind": "pixel",
          "count": 2
        }
      ],
      "textDescendantCount": 0,
      "nestedGroupCount": 0,
      "reason": "2 个可见子图层集中在 14×12 区域（占画布 1.1%），结构角色：图标按钮（无文本方形控件组 14×12）；建议合并为单层素材"
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
      "path": "0/1",
      "newName": "example-name",
      "reason": "依据该图层的文本与父级命名"
    }
  ],
  "merges": [
    {
      "path": "5",
      "decision": "merge",
      "name": "example-component",
      "reason": "子层属于同一紧凑控件，适合栅格化为单层"
    }
  ]
}
```

将上述 JSON 保存为 `.json` 文件后导入 PSD Normalize Studio 审核。