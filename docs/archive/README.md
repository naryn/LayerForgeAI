# 文档归档

本目录保存已被新文档取代、但仍用于追溯决策的历史文档。归档文档**不作为当前状态
依据**；当前状态以 [README](../../README.md)、[PROGRESS](../PROGRESS.md)、
[FEATURE_MAP](../FEATURE_MAP.md)、[M0_FEASIBILITY](../M0_FEASIBILITY.md) 和
[EVIDENCE](../EVIDENCE.md) 为准。

## 归档规则

- 只有被明确取代的文档才移入本目录，并在开头加上归档说明与日期。
- 文档中的数字、结论和“未验证”状态保留原样，不回填后续结果；需要当前数据时查
  `docs/PROGRESS.md` 或对应证据 manifest。
- 归档目录按“日期-主题”命名；文件可从仓库根目录用 `git mv` 移入，保留历史。
- 进度快照、M0 报告的历史版本不单独复制到本目录：需要追溯时查看 Git 历史
  （`git log -- docs/PROGRESS.md`、`git log -- docs/M0_FEASIBILITY.md`）。
  `.recovery/` 下的本地快照只用于故障恢复，已被 `.gitignore` 排除，不属于仓库证据。

## 索引

| 目录 | 原位置 | 内容 | 取代者 |
| --- | --- | --- | --- |
| `2026-10-20-design-v1/` | 仓库根的 `PSD Normalize Studio Web — 基于 Patchy 的技术实施方案 V1.0.md` | 项目启动时的总体技术方案：目标、架构、里程碑与早期风险判断 | `README.md`、`docs/PROGRESS.md`、`docs/M0_FEASIBILITY.md`、`docs/EVIDENCE.md` |
