import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { writePsdBuffer } from "ag-psd";

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

function fixtureBytes(): Buffer {
  const background = solidData(240, 160, [242, 246, 250, 255]);
  const card = solidData(80, 40, [32, 92, 214, 255]);
  const media = solidData(60, 60, [24, 164, 96, 255]);
  const composite = solidData(240, 160, [242, 246, 250, 255]);
  drawRect(composite, 20, 20, 80, 40, [32, 92, 214, 255]);
  drawRect(composite, 160, 20, 60, 60, [24, 164, 96, 255]);
  return Buffer.from(
    new Uint8Array(
      writePsdBuffer({
        width: 240,
        height: 160,
        imageData: composite,
        children: [
          { name: "Layer 1", imageData: background },
          {
            name: "Group 12",
            children: [
              { name: "Rectangle 5", imageData: card, top: 20, left: 20 },
              { name: "Ellipse 2", imageData: media, top: 20, left: 160 },
            ],
          },
          {
            name: "Layer 13",
            text: { text: "Pay Now" },
            top: 100,
            left: 20,
            right: 100,
            bottom: 120,
          },
          {
            name: "Group 20",
            children: [
              {
                name: "Layer 14",
                text: { text: "Close" },
                top: 100,
                left: 120,
                right: 200,
                bottom: 120,
              },
              {
                name: "Layer 15",
                text: { text: "VIP" },
                top: 130,
                left: 120,
                right: 200,
                bottom: 150,
              },
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
    name: "ai-naming-fixture.psd",
    mimeType: "image/vnd.adobe.photoshop",
    buffer: fixtureBytes(),
  });
  await page.fill("#import-name", "e2e ai naming");
  await page.getByRole("button", { name: "导入并打开" }).click();
  await expect(page.locator(".engine-pill__label")).toHaveText("演示引擎 · 不写入文件");
}

test("导出 AI 命名任务、导入严格校验结果并审核加入计划", async ({ page }) => {
  await importFixture(page);

  await page.getByRole("button", { name: "一键整理" }).click();
  await expect(page.locator(".cleanup-panel .stat-chip__value")).toHaveCount(5);
  const aiButton = page.getByRole("button", { name: /AI 语义命名/ });
  await expect(aiButton).toContainText("4");
  await aiButton.click();

  const dialog = page.getByRole("dialog", { name: "AI 语义命名" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("4 个候选");

  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "下载 AI 命名任务" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain("-ai-naming-prompt.md");
  const prompt = await readFile((await download.path())!, "utf8");
  expect(prompt).toContain("layerforge.ai-naming.request");
  expect(prompt).toContain("layerforge.ai-naming.response");
  expect(prompt).toContain('"path": "2"');
  expect(prompt).toContain('"path": "3/0"');
  expect(prompt).toContain("Layer 1");
  expect(prompt).toContain("Group 12");

  const response = {
    schema: "layerforge.ai-naming.response",
    schemaVersion: "0.1.0",
    renames: [
      { path: "2", newName: "pay-cta", reason: "按钮文案" },
      { path: "3", newName: "feature-card", reason: "包含两个文本图层" },
      { path: "3/0", newName: "feature-card-title", reason: "卡片标题" },
      { path: "9/9", newName: "ghost", reason: "不存在" },
    ],
  };
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "ai-naming.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(response)),
  });

  const review = dialog.getByTestId("ai-naming-review");
  await expect(review).toBeVisible();
  await expect(review).toContainText("3 项通过");
  await expect(review).toContainText("1 项需修正");
  await expect(review).toContainText("路径不在本次候选列表");
  await expect(review.getByText("pay-cta", { exact: true })).toBeVisible();

  await dialog.getByRole("button", { name: "加入命名计划（3 项）" }).click();
  await expect(page.getByRole("tab", { name: /计划/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.locator(".plan-item")).toHaveCount(3);
  await expect(page.locator(".plan-item .badge")).toHaveText(["草稿", "草稿", "草稿"]);
  await expect(page.locator(".plan-item__note")).toHaveText([
    "AI 语义命名建议：按钮文案",
    "AI 语义命名建议：包含两个文本图层",
    "AI 语义命名建议：卡片标题",
  ]);
});
