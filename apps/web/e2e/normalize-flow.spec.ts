import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { writePsdBuffer } from "ag-psd";

function layerData(width: number, height: number): ImageData {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) } as ImageData;
}

function fixtureBytes(): Buffer {
  return Buffer.from(
    new Uint8Array(
      writePsdBuffer({
        width: 160,
        height: 100,
        children: [
          { name: "背景 / 底图", imageData: layerData(160, 100) },
          {
            name: "hero",
            children: [
              { name: "hero / 标题", imageData: layerData(80, 24), top: 12, left: 16 },
              { name: "hero / 按钮", imageData: layerData(40, 16), top: 60, left: 100 },
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
    name: "e2e-fixture.psd",
    mimeType: "image/vnd.adobe.photoshop",
    buffer: fixtureBytes(),
  });
  await page.fill("#import-name", "e2e 校验");
  await page.getByRole("button", { name: "导入并打开" }).click();
  await expect(page.getByRole("tab", { name: /检查器/ })).toBeVisible();
  await expect(page.locator(".engine-pill__label")).toHaveText("演示引擎 · 不写入文件");
}

test("导入 → 重命名 → 计划 → 应用 → 保存并重开 → 历史验证", async ({ page }) => {
  await importFixture(page);

  await expect(page.locator(".statusbar__right")).toContainText("4 节点");

  await page.locator('[role="treeitem"]', { hasText: "hero / 按钮" }).first().click();
  await expect(page.locator(".layer-hero__text")).toContainText("hero / 按钮");

  await page.getByLabel("图层新名称").fill("hero/cta");
  await page.getByRole("button", { name: "重命名" }).click();
  await expect(
    page.locator('[role="treeitem"]', { hasText: "hero/cta" }).first(),
  ).toBeVisible();

  await page.getByLabel("计划中的新名称").fill("hero/cta_button");
  await page.getByRole("button", { name: "加入", exact: true }).click();

  await page.getByRole("tab", { name: /计划/ }).click();
  await expect(page.locator(".plan-item .badge")).toHaveText(["草稿"]);
  await expect(page.locator(".plan-item__names")).toContainText("hero/cta_button");

  await page.getByRole("button", { name: "应用 1 项" }).click();
  await expect(page.locator(".plan-item .badge")).toHaveText(["已应用"]);

  await page.getByRole("button", { name: "模拟保存并重开" }).click();
  await expect(page.locator("#save-file-name")).toHaveValue(/normalized\.psd$/);
  await page.getByRole("button", { name: "保存并重开", exact: true }).click();

  await expect(page.locator(".statusbar__right")).toContainText("计划 1/1 已验证");
  const history = page.locator(".history");
  await expect(history).toContainText("重开已验证");
  await expect(history).toContainText("未生成真实 PSD");
  await expect(page.getByTestId("psd-compare")).toHaveCount(0);
});

test("IR 草稿可导出为未验证的 JSON", async ({ page }) => {
  await importFixture(page);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "IR 草稿" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain("design-ir.json");

  const path = await download.path();
  const ir = JSON.parse(await readFile(path!, "utf8"));
  expect(ir.schema).toBe("layerforge.design-ir.draft");
  expect(ir.schemaVersion).toBe("0.4.0");
  expect(ir.status.validated).toBe(false);
  expect(ir.document.engine).toBe("demo");
  expect(ir.logicalGroups).toEqual([]);
  expect(ir.nodes[0].logicalGroupId).toBeNull();
  expect(ir.nodes[0].assetId).toBeNull();
  expect(ir.nodes).toHaveLength(2);
  expect(ir.nodes[1].children.map((node: { name: string }) => node.name)).toEqual([
    "hero / 标题",
    "hero / 按钮",
  ]);
});