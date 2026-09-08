import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const packageDir = fileURLToPath(new URL("..", import.meta.url));
const distDir = path.join(packageDir, "dist");
const bundlePath = path.join(distDir, "index.js");

async function findCssFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await findCssFiles(entryPath)));
    else if (entry.isFile() && entry.name.endsWith(".css"))
      files.push(entryPath);
  }
  return files;
}

async function main() {
  const bundle = await readFile(bundlePath, "utf8");
  const failures = [];
  for (const reference of [
    "var(--background",
    "var(--foreground",
    "var(--border",
    ".logicflow-editor-root",
  ]) {
    if (!bundle.includes(reference))
      failures.push(`Missing bundled style reference: ${reference}`);
  }
  const cssFiles = await findCssFiles(distDir);
  if (cssFiles.length)
    failures.push(`Unexpected standalone CSS files: ${cssFiles.join(", ")}`);
  if (failures.length) throw new Error(failures.join("\n"));
  console.log("LogicFlow distribution retains runtime theme styles.");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
