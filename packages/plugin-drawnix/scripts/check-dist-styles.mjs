import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const packageDir = fileURLToPath(new URL("..", import.meta.url));
const distDir = path.join(packageDir, "dist");
const bundlePath = path.join(distDir, "index.js");

const EXPECTED_RUNTIME_VAR_REFERENCES = [
  "var(--background",
  "var(--foreground",
  "var(--border",
  "var(--popover",
  "var(--muted-foreground",
  "var(--ring",
  "var(--drawnix-branch-color-light",
  "var(--drawnix-branch-color-dark",
  "var(--drawnix-node-border-color-light",
  "var(--drawnix-node-border-color-dark",
  "var(--drawnix-node-background-color-light",
  "var(--drawnix-node-background-color-dark",
  "var(--drawnix-node-text-color-light",
  "var(--drawnix-node-text-color-dark",
  "var(--drawnix-node-font-size",
  "var(--drawnix-node-line-height",
];

async function findCssFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const cssFiles = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      cssFiles.push(...(await findCssFiles(entryPath)));
    } else if (entry.isFile() && entry.name.endsWith(".css")) {
      cssFiles.push(path.relative(packageDir, entryPath));
    }
  }

  return cssFiles;
}

async function main() {
  let bundle;
  try {
    bundle = await readFile(bundlePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(
        `Missing Drawnix bundle: ${path.relative(packageDir, bundlePath)}`,
      );
    }
    throw error;
  }

  const failures = [];
  const compactBundle = bundle.replace(/\\[nrt]|\s/g, "");
  const missingReferences = EXPECTED_RUNTIME_VAR_REFERENCES.filter(
    (reference) => !compactBundle.includes(reference),
  );

  if (missingReferences.length > 0) {
    failures.push(
      `Missing runtime CSS variable consumers:\n${missingReferences
        .map((reference) => `  - ${reference}`)
        .join("\n")}`,
    );
  }

  if (!bundle.includes(".drawnix-dark")) {
    failures.push("Missing .drawnix-dark selector in the injected stylesheet");
  }

  const cssFiles = await findCssFiles(distDir);
  if (cssFiles.length > 0) {
    failures.push(
      `Unexpected standalone CSS files:\n${cssFiles
        .map((file) => `  - ${file}`)
        .join("\n")}`,
    );
  }

  if (failures.length > 0) {
    throw new Error(
      `Drawnix distribution style check failed:\n\n${failures.join("\n\n")}`,
    );
  }

  console.log(
    "Drawnix distribution retains runtime theme and node style variables.",
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
