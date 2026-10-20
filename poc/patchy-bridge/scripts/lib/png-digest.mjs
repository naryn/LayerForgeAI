import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

// crypto.subtle is only exposed in a secure context; a temporary loopback page
// makes the independent PNG decode possible without trusting the WASM origin.
export async function decodePngDigests(browser, files) {
  const server = createServer((request, response) => {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end("<!doctype html><title>png-digest</title>");
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${port}/`);
    const digests = {};
    for (const [key, filePath] of Object.entries(files)) {
      const base64 = (await readFile(filePath)).toString("base64");
      digests[key] = await page.evaluate(async (encoded) => {
        const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
        const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context.drawImage(bitmap, 0, 0);
        const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
        const digest = await crypto.subtle.digest("SHA-256", pixels);
        return {
          width: bitmap.width,
          height: bitmap.height,
          rgbaSha256: [...new Uint8Array(digest)]
            .map((value) => value.toString(16).padStart(2, "0")).join(""),
        };
      }, base64);
    }
    await page.close();
    return digests;
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}
