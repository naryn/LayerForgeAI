import { access, cp, mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(here, "..");
const targetDir = path.join(webRoot, "public", "patchy");
const sourceArg = process.argv[2];

if (!sourceArg) {
  console.error("usage: npm run stage:patchy -- <path-to-built-patchy-site>");
  console.error("The directory must contain patchy.html from a bridge-enabled wasm-release build.");
  process.exit(1);
}

const sourceDir = path.resolve(sourceArg);

try {
  await access(path.join(sourceDir, "patchy.html"));
} catch {
  console.error(`stage:patchy: ${path.join(sourceDir, "patchy.html")} not found`);
  process.exit(1);
}

await rm(targetDir, { recursive: true, force: true });
await mkdir(path.dirname(targetDir), { recursive: true });
await cp(sourceDir, targetDir, { recursive: true });

const bridgeMarker = "__patchyStageBrowserFile";
const hasBridge = await containsMarker(targetDir, bridgeMarker);

console.log(`stage:patchy: copied ${sourceDir} -> ${targetDir}`);
console.log("Served at /patchy/patchy.html");
if (!hasBridge) {
  console.warn(
    `stage:patchy: warning: no "${bridgeMarker}" string found in the build. ` +
      "The iframe will load but the bridge will report ENGINE_UNAVAILABLE.",
  );
}

async function containsMarker(directory, marker) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (await containsMarker(entryPath, marker)) return true;
      continue;
    }
    if (!/\.(?:js|mjs|html)$/i.test(entry.name)) continue;
    const info = await stat(entryPath);
    if (info.size > 32 * 1024 * 1024) continue;
    if ((await readFile(entryPath, "utf8")).includes(marker)) return true;
  }
  return false;
}