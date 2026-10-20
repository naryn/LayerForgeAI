import { access, copyFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.join(here, "..", "web");
const siteDir = process.argv[2];
if (!siteDir) throw new Error("usage: node stage-dev-site.mjs <built-wasm-site>");

const htmlPath = path.join(siteDir, "patchy.html");
await access(htmlPath);

for (const name of ["patchy-bridge.js", "m0-harness.js"]) {
  await copyFile(path.join(webDir, name), path.join(siteDir, name));
}

const marker = '<script type="module" src="m0-harness.js"></script>';
let html = await readFile(htmlPath, "utf8");
if (!html.includes(marker)) {
  if (!html.includes("</body>")) throw new Error("patchy.html has no closing body tag");
  html = html.replace("</body>", `  ${marker}\n</body>`);
  await writeFile(htmlPath, html);
}
console.log(`M0 harness staged in ${siteDir}`);
