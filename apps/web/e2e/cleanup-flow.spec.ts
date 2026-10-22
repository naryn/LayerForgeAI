import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { writePsdBuffer } from "ag-psd";
import { unzipSync } from "fflate";

type Rgba = [number, number, number, number];

function solidData(width: number, height: number, color: Rgba): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = color[0];
    data[index + 1] = color[1];
    data[index + 2] = color[2];
    data[index + 3] = color[3];
  }
  return { width, height, data } as ImageData;
}

function drawRect(
  target: ImageData,
  x: number,
  y: number,
  width: number,
  height: number,
  color: Rgba,
): void {
  for (let row = y; row < y + height; row += 1) {
    for (let column = x; column < x + width; column += 1) {
      const index = (row * target.width + column) * 4;
      target.data[index] = color[0];
      target.data[index + 1] = color[1];
      target.data[index + 2] = color[2];
      target.data[index + 3] = color[3];
    }
  }
}

interface IrNodeShape {
  sourcePath: string;
  assetId: string | null;
  children: IrNodeShape[];
}

interface IrAssetShape {
  id: string;
  sourcePath: string;
}

function findIrNode(nodes: IrNodeShape[], path: string): IrNodeShape | null {
  for (const node of nodes) {
    if (node.sourcePath === path) return node;
    const found = findIrNode(node.children, path);
    if (found) return found;
  }
  return null;
}

function fixtureBytes(): Buffer {
  const background = solidData(160, 100, [240, 244, 248, 255]);
  const title = solidData(80, 24, [30, 90, 210, 255]);
  const button = solidData(40, 16, [20, 160, 90, 255]);
  const composite = solidData(160, 100, [240, 244, 248, 255]);
  drawRect(composite, 16, 12, 80, 24, [30, 90, 210, 255]);
  drawRect(composite, 100, 60, 40, 16, [20, 160, 90, 255]);
  return Buffer.from(
    new Uint8Array(
      writePsdBuffer({
        width: 160,
        height: 100,
        imageData: composite,
        children: [
          { name: "背景 / 底图", imageData: background },
          {
            name: "hero",
            children: [
              { name: "hero / 标题", imageData: title, top: 12, left: 16 },
              { name: "hero / 按钮", imageData: button, top: 60, left: 100 },
            ],
          },
        ],
      }),
    ),
  );
}

async function importFixture(page: Page): Promise<void> {
  await page.goto("/?engine=demo");
  await page.getByRole("button", { name: "导入 PSD" }).click();
  await page.setInputFiles("#import-file", {
    name: "cleanup-fixture.psd",
    mimeType: "image/vnd.adobe.photoshop",
    buffer: fixtureBytes(),
  });
  await page.fill("#import-name", "e2e 整理");
  await page.getByRole("button", { name: "导入并打开" }).click();
  await expect(page.locator(".engine-pill__label")).toHaveText("演示引擎 · 不写入文件");
}

test("一键整理生成命名计划 → 应用 → 保存并重开验证", async ({ page }) => {
  await importFixture(page);

  await page.getByRole("button", { name: "一键整理" }).click();
  await expect(page.getByRole("tab", { name: /整理/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.locator(".cleanup-panel .stat-chip__value")).toHaveText([
    "4",
    "0",
    "0",
    "0",
    "2",
  ]);

  await page.getByRole("button", { name: /生成命名计划/ }).click();
  await expect(page.getByRole("tab", { name: /计划/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.locator(".plan-item .badge")).toHaveText([
    "草稿",
    "草稿",
    "草稿",
    "草稿",
  ]);

  await page.getByRole("button", { name: "应用 4 项" }).click();
  await expect(page.locator(".plan-item .badge")).toHaveText([
    "已应用",
    "已应用",
    "已应用",
    "已应用",
  ]);

  await page.getByRole("button", { name: "模拟保存并重开" }).click();
  await page.getByRole("button", { name: "保存并重开", exact: true }).click();
  await expect(page.locator(".statusbar__right")).toContainText("计划 4/4 已验证");

  const diffCard = page.getByTestId("diff-card");
  await expect(diffCard).toContainText("保存前后结构对比");
  await expect(page.getByTestId("diff-renamed")).toHaveText("4");
  await expect(diffCard).toContainText("模拟保存");
  await expect(diffCard).toContainText("不是 PSD 二进制");
  await expect(page.locator(".revision__diff")).toContainText("命名 4");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出对比 JSON" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain("-psd-diff-");
  const report = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(report.schema).toBe("layerforge.psd-diff");
  expect(report.evidence).toBe("engine-layer-tree");
  expect(report.simulated).toBe(true);
  expect(report.baseline).toBe("session-open");
  expect(report.summary).toMatchObject({
    renamed: 4,
    added: 0,
    removed: 0,
    unchanged: 0,
  });
  expect(report.entries).toHaveLength(4);
});

test("一键整理导出未生成像素的资产清单", async ({ page }) => {
  await importFixture(page);

  await page.getByRole("button", { name: "一键整理" }).click();
  await expect(page.locator(".cleanup-panel .stat-chip__value")).toHaveText([
    "4",
    "0",
    "0",
    "0",
    "2",
  ]);
  await expect(page.locator(".cleanup-slice")).toHaveCount(2);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出资产清单" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain("assets.json");

  const filePath = await download.path();
  const manifest = JSON.parse(await readFile(filePath!, "utf8"));
  expect(manifest.schema).toBe("layerforge.asset-manifest.draft");
  expect(manifest.status).toMatchObject({ validated: false, pixels: "not-generated" });
  expect(manifest.assets).toHaveLength(2);
  expect(manifest.assets.map((asset: { name: string }) => asset.name)).toEqual([
    "hero / 标题",
    "hero / 按钮",
  ]);
  expect(
    manifest.assets[0].outputs.map((output: { fileName: string }) => output.fileName),
  ).toEqual(["hero-标题.png", "hero-标题@2x.png"]);
  expect(manifest.notes.join(" ")).toContain("未执行逐图层渲染");
});

test("导出资产包 ZIP：真实 PNG 切图、解码校验与 AI 编码上下文", async ({ page }) => {
  test.setTimeout(60_000);
  await importFixture(page);

  await page.getByRole("button", { name: "一键整理" }).click();
  await expect(page.locator(".cleanup-panel .stat-chip__value")).toHaveText([
    "4",
    "0",
    "0",
    "0",
    "2",
  ]);
  await expect(page.getByRole("heading", { name: "逻辑编组建议" })).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出资产包 ZIP" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain("asset-pack.zip");

  const filePath = await download.path();
  const entries = unzipSync(new Uint8Array(await readFile(filePath!)));
  expect(Object.keys(entries)).toEqual(
    expect.arrayContaining([
      "manifest.json",
      "design-ir.json",
      "agent-context.md",
      "preview.html",
      "comparison.json",
      "assets/hero-标题.png",
      "assets/hero-标题@2x.png",
      "assets/hero-按钮.png",
      "preview/original-composite.png",
      "preview/page-reconstruction.png",
    ]),
  );

  const decoder = new TextDecoder();
  const manifest = JSON.parse(decoder.decode(entries["manifest.json"]));
  expect(manifest.schema).toBe("layerforge.asset-pack");
  expect(manifest.schemaVersion).toBe("0.4.0");
  expect(manifest.logicalGroups).toEqual([]);

  const ir = JSON.parse(decoder.decode(entries["design-ir.json"]));
  expect(ir.schema).toBe("layerforge.design-ir.draft");
  expect(ir.schemaVersion).toBe("0.4.0");
  expect(ir.logicalGroups).toEqual([]);
  expect(
    (ir.nodes as Array<{ logicalGroupId: string | null }>).every(
      (node) => node.logicalGroupId === null,
    ),
  ).toBe(true);
  for (const asset of manifest.assets as IrAssetShape[]) {
    const node = findIrNode(ir.nodes as IrNodeShape[], asset.sourcePath);
    expect(node?.assetId).toBe(asset.id);
  }
  expect(manifest.status).toMatchObject({
    validated: false,
    pixels: "generated-local-composite-crops",
  });
  expect(manifest.assets).toHaveLength(2);
  expect(manifest.comparison.verifiedAssets).toBe(2);
  expect(manifest.comparison.mismatchedAssets).toBe(0);
  expect(manifest.comparison.maxChannelDelta).toBeLessThanOrEqual(2);
  expect(manifest.comparison.coverageRatio).toBeGreaterThan(0.1);
  expect(manifest.files).toEqual(expect.arrayContaining(["assets/hero-按钮@2x.png"]));

  const titlePng = entries["assets/hero-标题.png"];
  expect(Array.from(titlePng.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const pngView = new DataView(
    titlePng.buffer,
    titlePng.byteOffset,
    titlePng.byteLength,
  );
  expect(pngView.getUint32(16)).toBe(80);
  expect(pngView.getUint32(20)).toBe(24);

  const preview = decoder.decode(entries["preview.html"]);
  expect(preview).toContain("页面对比");
  expect(preview).toContain("assets/hero-按钮.png");
  const agentContext = decoder.decode(entries["agent-context.md"]);
  expect(agentContext).toContain("hero / 按钮");
  expect(agentContext).toContain("合成图裁切");
  expect(agentContext).toContain("## 逻辑编组建议");
  expect(agentContext).toContain("没有符合规则的逻辑编组建议。");
});
