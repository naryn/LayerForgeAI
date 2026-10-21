import type { LayerNode, PlanEntry } from "./domain";
import { sanitizeFileName } from "./format";
import { findLayerByPath, flattenLayers } from "./layers";

function twoDigits(value: number): string {
  return value.toString().padStart(2, "0");
}

export function suggestedNormalizedFileName(projectName: string, now = new Date()): string {
  const stamp = [
    now.getFullYear(),
    twoDigits(now.getMonth() + 1),
    twoDigits(now.getDate()),
    "-",
    twoDigits(now.getHours()),
    twoDigits(now.getMinutes()),
    twoDigits(now.getSeconds()),
  ].join("");
  return `${sanitizeFileName(projectName)}-${stamp}-normalized.psd`;
}

export function toSavedPath(fileName: string): string {
  const trimmed = fileName.trim();
  if (!trimmed) throw new Error("文件名不能为空");
  if (/[\\/]/.test(trimmed)) throw new Error("文件名不能包含路径分隔符");
  if (!/\.(psd|psb)$/i.test(trimmed)) throw new Error("文件名必须以 .psd 或 .psb 结尾");
  return `/saved/${trimmed}`;
}

export interface PlanVerification {
  plan: PlanEntry[];
  attempted: number;
  verified: number;
  failed: number;
}

/**
 * Match applied naming entries against the reopened document. Path is the
 * primary key; a unique resulting name is accepted as a fallback with a note.
 */
export function verifyPlanAgainstLayers(
  plan: PlanEntry[],
  layers: LayerNode[],
): PlanVerification {
  const flat = flattenLayers(layers);
  const byName = new Map<string, LayerNode[]>();
  for (const layer of flat) {
    const list = byName.get(layer.name) ?? [];
    list.push(layer);
    byName.set(layer.name, list);
  }
  let attempted = 0;
  let verified = 0;
  let failed = 0;
  const next = plan.map((entry) => {
    if (entry.status !== "applied" && entry.status !== "verified" && entry.status !== "failed") {
      return entry;
    }
    attempted += 1;
    const atPath = findLayerByPath(layers, entry.path);
    if (atPath?.name === entry.newName) {
      verified += 1;
      return {
        ...entry,
        status: "verified" as const,
        layerId: atPath.id,
        note: undefined,
      };
    }
    const byNewName = byName.get(entry.newName) ?? [];
    if (byNewName.length === 1) {
      verified += 1;
      return {
        ...entry,
        status: "verified" as const,
        layerId: byNewName[0].id,
        note: `按唯一新名称匹配（路径 ${byNewName[0].path}）`,
      };
    }
    failed += 1;
    return {
      ...entry,
      status: "failed" as const,
      note: "保存并重开后未能在同一路径找到新名称",
    };
  });
  return { plan: next, attempted, verified, failed };
}

export interface PlanStats {
  total: number;
  draft: number;
  applied: number;
  verified: number;
  failed: number;
  pending: number;
}

export function planStats(plan: PlanEntry[]): PlanStats {
  const stats: PlanStats = {
    total: plan.length,
    draft: 0,
    applied: 0,
    verified: 0,
    failed: 0,
    pending: 0,
  };
  for (const entry of plan) {
    stats[entry.status] += 1;
  }
  stats.pending = stats.draft + stats.failed;
  return stats;
}
