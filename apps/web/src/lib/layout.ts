import type { LayerBounds } from "./domain";

export type LayoutDirection = "row" | "column" | "stack";
export type LayoutAlign = "start" | "center" | "end" | "mixed";

export interface ComponentLayoutHint {
  direction: LayoutDirection;
  gap: number | null;
  align: LayoutAlign;
}

export interface LayoutMember {
  bounds?: LayerBounds | null;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const MIN_OVERLAP = 1;
const CROSS_TOLERANCE_RATIO = 0.12;

function isBox(value: LayerBounds | null | undefined): value is LayerBounds {
  return Boolean(value && value.width > 0 && value.height > 0);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function spread(values: number[]): number {
  return Math.max(...values) - Math.min(...values);
}

function sortByAxis(boxes: Box[], axis: "x" | "y"): Box[] {
  return [...boxes].sort((a, b) =>
    axis === "x" ? a.x - b.x || a.y - b.y : a.y - b.y || a.x - b.x,
  );
}

function axisEnd(box: Box, axis: "x" | "y"): number {
  return axis === "x" ? box.x + box.width : box.y + box.height;
}

function axisStart(box: Box, axis: "x" | "y"): number {
  return axis === "x" ? box.x : box.y;
}

function intervalsOverlap(
  startA: number,
  endA: number,
  startB: number,
  endB: number,
): number {
  return Math.min(endA, endB) - Math.max(startA, startB);
}

function isClearAlong(boxes: Box[], axis: "x" | "y"): boolean {
  const sorted = sortByAxis(boxes, axis);
  return sorted.every(
    (box, index) =>
      index === 0 || axisStart(box, axis) >= axisEnd(sorted[index - 1], axis) - MIN_OVERLAP,
  );
}

function adjacentOverlapAlong(boxes: Box[], axis: "x" | "y"): boolean {
  const sorted = sortByAxis(boxes, axis);
  const cross = axis === "x" ? "y" : "x";
  return sorted.every((box, index) => {
    if (index === 0) return true;
    const previous = sorted[index - 1];
    return (
      intervalsOverlap(
        axisStart(box, cross),
        axisEnd(box, cross),
        axisStart(previous, cross),
        axisEnd(previous, cross),
      ) >= MIN_OVERLAP
    );
  });
}

function axisGap(boxes: Box[], axis: "x" | "y"): number {
  const sorted = sortByAxis(boxes, axis);
  const gaps: number[] = [];
  for (let index = 1; index < sorted.length; index += 1) {
    gaps.push(
      Math.max(0, axisStart(sorted[index], axis) - axisEnd(sorted[index - 1], axis)),
    );
  }
  return Math.round(median(gaps));
}

function crossAlign(boxes: Box[], axis: "x" | "y"): LayoutAlign {
  const starts = boxes.map((box) => axisStart(box, axis));
  const sizes = boxes.map((box) => (axis === "x" ? box.width : box.height));
  const ends = starts.map((start, index) => start + sizes[index]);
  const centers = starts.map((start, index) => start + sizes[index] / 2);
  const tolerance = Math.max(2, Math.round(median(sizes) * CROSS_TOLERANCE_RATIO));
  if (spread(starts) <= tolerance) return "start";
  if (spread(ends) <= tolerance) return "end";
  if (spread(centers) <= tolerance) return "center";
  return "mixed";
}

function stackAlign(boxes: Box[]): LayoutAlign {
  const xTolerance = Math.max(2, Math.round(median(boxes.map((box) => box.width)) * CROSS_TOLERANCE_RATIO));
  const yTolerance = Math.max(2, Math.round(median(boxes.map((box) => box.height)) * CROSS_TOLERANCE_RATIO));
  const xCenters = boxes.map((box) => box.x + box.width / 2);
  const yCenters = boxes.map((box) => box.y + box.height / 2);
  return spread(xCenters) <= xTolerance && spread(yCenters) <= yTolerance ? "center" : "mixed";
}

export function inferComponentLayout(members: LayoutMember[]): ComponentLayoutHint {
  const boxes = members
    .map((member) => member.bounds)
    .filter(isBox)
    .map((bounds) => ({ ...bounds }));
  if (boxes.length < 2) return { direction: "stack", gap: null, align: "mixed" };

  const rowLike = isClearAlong(boxes, "x") && adjacentOverlapAlong(boxes, "x");
  const columnLike = isClearAlong(boxes, "y") && adjacentOverlapAlong(boxes, "y");

  let direction: LayoutDirection;
  if (rowLike && !columnLike) {
    direction = "row";
  } else if (columnLike && !rowLike) {
    direction = "column";
  } else if (rowLike && columnLike) {
    const width = Math.max(...boxes.map((box) => box.x + box.width)) - Math.min(...boxes.map((box) => box.x));
    const height = Math.max(...boxes.map((box) => box.y + box.height)) - Math.min(...boxes.map((box) => box.y));
    direction = width >= height ? "row" : "column";
  } else {
    direction = "stack";
  }

  if (direction === "row") {
    return { direction, gap: axisGap(boxes, "x"), align: crossAlign(boxes, "y") };
  }
  if (direction === "column") {
    return { direction, gap: axisGap(boxes, "y"), align: crossAlign(boxes, "x") };
  }
  return { direction, gap: null, align: stackAlign(boxes) };
}

const DIRECTION_LABELS: Record<LayoutDirection, string> = {
  row: "横向",
  column: "纵向",
  stack: "叠加",
};

const ALIGN_LABELS: Record<LayoutAlign, string> = {
  start: "起始对齐",
  center: "居中",
  end: "末端对齐",
  mixed: "混合",
};

export function layoutSummary(hint: ComponentLayoutHint): string {
  const gap = hint.gap === null ? "无间距" : `间距 ${hint.gap}px`;
  return `${DIRECTION_LABELS[hint.direction]} · ${gap} · ${ALIGN_LABELS[hint.align]}`;
}
