import { writePsdBuffer } from "ag-psd";
import { describe, expect, it } from "vitest";
import { comparePsdFiles, summarizePsdComparison } from "./psdCompare";

type Rgba = [number, number, number, number];

function solid(width: number, height: number, color: Rgba): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = color[0];
    data[index + 1] = color[1];
    data[index + 2] = color[2];
    data[index + 3] = color[3];
  }
  return { width, height, data } as ImageData;
}

const WIDTH = 32;
const HEIGHT = 24;

function psdBytes(options: { background?: Rgba; title?: string } = {}): Uint8Array {
  const background = options.background ?? [246, 248, 250, 255];
  return writePsdBuffer({
    width: WIDTH,
    height: HEIGHT,
    imageData: solid(WIDTH, HEIGHT, background),
    children: [
      { name: "background", imageData: solid(WIDTH, HEIGHT, background) },
      {
        name: options.title ?? "headline",
        imageData: solid(8, 8, [20, 40, 80, 255]),
        top: 4,
        left: 4,
      },
    ],
  });
}

describe("comparePsdFiles", () => {
  it("字节相同的两份 PSD 标记为一致", async () => {
    const bytes = psdBytes();
    const report = await comparePsdFiles(
      { fileName: "source.psd", bytes },
      { fileName: "/saved/copy.psd", bytes },
    );
    expect(report.evidence).toBe("ag-psd-independent");
    expect(report.identicalBinary).toBe(true);
    expect(report.source.sha256).toBe(report.saved.sha256);
    expect(report.source.layerCount).toBe(2);
    expect(report.saved.layerCount).toBe(2);
    expect(report.structure.unchanged).toBe(2);
    expect(report.pixel.available).toBe(true);
    expect(report.pixel.differingPixels).toBe(0);
    expect(report.pixel.totalPixels).toBe(WIDTH * HEIGHT);
    expect(report.layerPixels).toMatchObject({
      available: true,
      binaryIdentical: true,
      compared: 2,
      identical: 2,
      differing: 0,
      totalPixels: WIDTH * HEIGHT + 8 * 8,
      matchedByName: 2,
    });
    expect(report.layerPixels.entries).toEqual([]);
  });

  it("独立识别重命名，且合成图与逐层像素仍一致", async () => {
    const report = await comparePsdFiles(
      { fileName: "source.psd", bytes: psdBytes() },
      { fileName: "/saved/renamed.psd", bytes: psdBytes({ title: "hero-headline" }) },
    );
    expect(report.identicalBinary).toBe(false);
    expect(report.structure.renamed).toBe(1);
    expect(report.structure.unchanged).toBe(1);
    expect(report.pixel.available).toBe(true);
    expect(report.pixel.differingPixels).toBe(0);
    expect(report.pixel.maxDelta).toBe(0);
    expect(report.layerPixels.available).toBe(true);
    expect(report.layerPixels.compared).toBe(2);
    expect(report.layerPixels.differing).toBe(0);
    expect(report.layerPixels.matchedByName).toBe(1);
    expect(report.layerPixels.matchedByPath).toBe(1);
  });

  it("比较内嵌合成图并返回差异边界", async () => {
    const report = await comparePsdFiles(
      { fileName: "source.psd", bytes: psdBytes() },
      {
        fileName: "/saved/dark.psd",
        bytes: psdBytes({ background: [10, 10, 10, 255] }),
      },
    );
    expect(report.pixel.available).toBe(true);
    expect(report.pixel.differingPixels).toBe(WIDTH * HEIGHT);
    expect(report.pixel.ratio).toBe(1);
    expect(report.pixel.maxDelta).toBe(240);
    expect(report.pixel.bounds).toEqual({
      x: 0,
      y: 0,
      width: WIDTH,
      height: HEIGHT,
    });
    expect(report.layerPixels.available).toBe(true);
    expect(report.layerPixels.compared).toBe(2);
    expect(report.layerPixels.differing).toBe(1);
    expect(report.layerPixels.differingPixels).toBe(WIDTH * HEIGHT);
    expect(report.layerPixels.maxDelta).toBe(240);
    expect(report.layerPixels.entries[0]).toMatchObject({
      name: "background",
      status: "differing",
      differingPixels: WIDTH * HEIGHT,
    });
  });

  it("通道差不超过容差时不标记为差异像素", async () => {
    const report = await comparePsdFiles(
      { fileName: "source.psd", bytes: psdBytes() },
      {
        fileName: "/saved/plus-two.psd",
        bytes: psdBytes({ background: [248, 250, 252, 255] }),
      },
    );
    expect(report.pixel.available).toBe(true);
    expect(report.pixel.differingPixels).toBe(0);
    expect(report.pixel.maxDelta).toBe(2);
  });

  it("超过像素上限时跳过合成图对比但保留结构结果", async () => {
    const report = await comparePsdFiles(
      { fileName: "source.psd", bytes: psdBytes() },
      { fileName: "/saved/copy.psd", bytes: psdBytes() },
      { maxPixels: 100, maxLayerPixels: 10 },
    );
    expect(report.structure.unchanged).toBe(2);
    expect(report.pixel.available).toBe(false);
    expect(report.pixel.reason).toMatch(/超过独立像素对比上限/);
    expect(report.layerPixels.available).toBe(false);
    expect(report.layerPixels.truncated).toBe(true);
    expect(report.layerPixels.reason).toMatch(/逐层像素总量超过上限/);
  });

  it("合成图一致时仍能发现隐藏图层的像素变化", async () => {
    const background: Rgba = [246, 248, 250, 255];
    const hidden = (color: Rgba) =>
      writePsdBuffer({
        width: WIDTH,
        height: HEIGHT,
        imageData: solid(WIDTH, HEIGHT, background),
        children: [
          { name: "background", imageData: solid(WIDTH, HEIGHT, background) },
          { name: "hidden-ornament", hidden: true, imageData: solid(6, 6, color), top: 2, left: 2 },
        ],
      });
    const report = await comparePsdFiles(
      { fileName: "source.psd", bytes: hidden([255, 0, 0, 255]) },
      { fileName: "/saved/hidden.psd", bytes: hidden([0, 0, 255, 255]) },
    );
    expect(report.pixel.available).toBe(true);
    expect(report.pixel.differingPixels).toBe(0);
    expect(report.layerPixels.available).toBe(true);
    expect(report.layerPixels.compared).toBe(2);
    expect(report.layerPixels.differing).toBe(1);
    expect(report.layerPixels.differingPixels).toBe(36);
    expect(report.layerPixels.maxDelta).toBe(255);
    expect(report.layerPixels.entries[0]).toMatchObject({
      name: "hidden-ornament",
      status: "differing",
      matchedBy: "name",
    });
  });

  it("编组改变路径后按唯一名称配对同内容图层", async () => {
    const background: Rgba = [246, 248, 250, 255];
    const leaves = () => [
      { name: "dot", imageData: solid(6, 6, [10, 20, 30, 255]), top: 2, left: 2 },
      { name: "ring", imageData: solid(6, 6, [40, 50, 60, 255]), top: 10, left: 10 },
    ];
    const source = writePsdBuffer({
      width: WIDTH,
      height: HEIGHT,
      imageData: solid(WIDTH, HEIGHT, background),
      children: [{ name: "badge", children: leaves() }],
    });
    const saved = writePsdBuffer({
      width: WIDTH,
      height: HEIGHT,
      imageData: solid(WIDTH, HEIGHT, background),
      children: [
        { name: "background", imageData: solid(WIDTH, HEIGHT, background) },
        { name: "row-cluster", children: leaves() },
      ],
    });
    const report = await comparePsdFiles(
      { fileName: "source.psd", bytes: source },
      { fileName: "/saved/grouped.psd", bytes: saved },
    );
    expect(report.layerPixels.matchedByName).toBe(2);
    expect(report.layerPixels.matchedByPath).toBe(0);
    expect(report.layerPixels.compared).toBe(2);
    expect(report.layerPixels.differing).toBe(0);
    expect(report.layerPixels.unpaired).toBe(1);
  });

  it("图层尺寸变化时标记为不可比较", async () => {
    const resize = (size: number) =>
      writePsdBuffer({
        width: WIDTH,
        height: HEIGHT,
        imageData: solid(WIDTH, HEIGHT, [246, 248, 250, 255]),
        children: [
          { name: "background", imageData: solid(WIDTH, HEIGHT, [246, 248, 250, 255]) },
          {
            name: "headline",
            imageData: solid(size, 8, [20, 40, 80, 255]),
            top: 4,
            left: 4,
          },
        ],
      });
    const report = await comparePsdFiles(
      { fileName: "source.psd", bytes: resize(8) },
      { fileName: "/saved/resized.psd", bytes: resize(12) },
    );
    expect(report.layerPixels.available).toBe(true);
    expect(report.layerPixels.compared).toBe(1);
    expect(report.layerPixels.unavailable).toBe(1);
    const entry = report.layerPixels.entries.find((item) => item.name === "headline");
    expect(entry?.status).toBe("unavailable");
    expect(entry?.reason).toMatch(/图层尺寸变化：8×8 → 12×8/);
  });

  it("摘要保留哈希、图层数与像素结果", async () => {
    const report = await comparePsdFiles(
      { fileName: "source.psd", bytes: psdBytes() },
      { fileName: "/saved/copy.psd", bytes: psdBytes() },
    );
    const summary = summarizePsdComparison(report);
    expect(summary).toMatchObject({
      sourceSha256: report.source.sha256,
      savedSha256: report.saved.sha256,
      identicalBinary: true,
      sourceLayers: 2,
      savedLayers: 2,
      width: WIDTH,
      height: HEIGHT,
      pixelAvailable: true,
      pixelDiffering: 0,
      pixelTotal: WIDTH * HEIGHT,
      layerPixelAvailable: true,
      layerPixelCompared: 2,
      layerPixelIdentical: 2,
      layerPixelDifferingLayers: 0,
      layerPixelDiffering: 0,
      layerPixelTotal: WIDTH * HEIGHT + 8 * 8,
      layerPixelTruncated: false,
    });
    expect(summary.pixelMaxDelta).toBe(0);
    expect(summary.layerPixelMaxDelta).toBe(0);
  });
});
