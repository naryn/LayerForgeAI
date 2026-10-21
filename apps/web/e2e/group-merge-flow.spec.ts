import { expect, test, type Page } from "@playwright/test";
import { writePsdBuffer } from "ag-psd";

function solidData(width: number, height: number, color: [number, number, number, number]): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = color[0];
    data[index + 1] = color[1];
    data[index + 2] = color[2];
    data[index + 3] = color[3];
  }
  return { width, height, data } as ImageData;
}

function fixtureBytes(): Buffer {
  const background = solidData(160, 100, [246, 248, 250, 255]);
  const tile = (): ImageData => solidData(24, 16, [30, 90, 210, 255]);
  const badgeDot = solidData(12, 12, [200, 40, 40, 255]);
  const badgeIcon = solidData(8, 8, [255, 255, 255, 255]);
  return Buffer.from(
    new Uint8Array(
      writePsdBuffer({
        width: 160,
        height: 100,
        children: [
          { name: "page-background", imageData: background },
          { name: "hero-title", imageData: tile(), top: 10, left: 10 },
          { name: "hero-cta", imageData: tile(), top: 10, left: 38 },
          { name: "icon-star", imageData: tile(), top: 10, left: 66 },
          { name: "icon-heart", imageData: tile(), top: 10, left: 94 },
          {
            name: "badge",
            children: [
              { name: "badge-count", imageData: badgeDot, top: 70, left: 120 },
              { name: "badge-icon", imageData: badgeIcon, top: 74, left: 126 },
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
    name: "group-merge-fixture.psd",
    mimeType: "image/vnd.adobe.photoshop",
    buffer: fixtureBytes(),
  });
  await page.fill("#import-name", "e2e 编组合并");
  await page.getByRole("button", { name: "导入并打开" }).click();
  await expect(page.locator(".engine-pill__label")).toHaveText("演示引擎 · 不写入文件");
}

test("一键编组 → 一键合并 → 保存并重开", async ({ page }) => {
  await importFixture(page);

  await page.getByRole("button", { name: "一键整理" }).click();
  const stats = page.locator(".cleanup-panel .stat-chip__value");
  await expect(stats.nth(2)).toHaveText("1");
  await expect(stats.nth(3)).toHaveText("1");
  await expect(page.locator(".cleanup-group")).toHaveCount(1);
  await expect(page.locator(".cleanup-merge")).toHaveCount(1);

  await page.getByRole("button", { name: /一键编组（1）/ }).click();
  await expect(stats.nth(2)).toHaveText("0");
  await expect(page.locator(".tree-name").filter({ hasText: "row-cluster" })).toBeVisible();
  await expect(page.locator(".cleanup-merge")).toHaveCount(1);

  await page.getByRole("button", { name: /一键合并（1）/ }).click();
  await expect(stats.nth(3)).toHaveText("0");
  await expect(page.locator(".tree-name").filter({ hasText: "icon-button-merged" })).toBeVisible();

  await page.getByRole("button", { name: "模拟保存并重开" }).click();
  await page.getByRole("button", { name: "保存并重开", exact: true }).click();
  await expect(page.getByTestId("diff-card")).toContainText("保存前后结构对比");
  await expect(page.locator(".tree-name").filter({ hasText: "row-cluster" })).toBeVisible();
  await expect(page.locator(".tree-name").filter({ hasText: "icon-button-merged" })).toBeVisible();
  await expect(page.locator(".statusbar__right")).toContainText("计划 0/0 已验证");
});
