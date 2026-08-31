import { readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"]);

const read = (path) => readFileSync(path, "utf8");
const withoutComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

const walk = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (["dist", "node_modules", ".tmp-check", ".turbo"].includes(entry.name)) {
        return [];
      }
      return walk(path);
    }
    return sourceExtensions.has(extname(entry.name)) ? [path] : [];
  });

const fail = (path, message) => {
  failures.push(`${relative(root, path)}: ${message}`);
};

const getModuleSpecifiers = (source) =>
  [...withoutComments(source).matchAll(
    /(?:\bfrom\s*|\b(?:import|require)\s*\(\s*|\bimport\s*)["']([^"']+)["']/g,
  )].map((match) => match[1]);

const hasModuleReference = (source, moduleName) =>
  getModuleSpecifiers(source).some(
    (specifier) => specifier === moduleName || specifier.startsWith(`${moduleName}/`),
  );

const commonSrc = join(root, "packages/common/src");
for (const path of walk(commonSrc)) {
  if (hasModuleReference(read(path), "@kn/core")) {
    fail(path, "common must not import @kn/core");
  }
}

const packagesDir = join(root, "packages");
for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
  if (!entry.isDirectory() || !entry.name.startsWith("plugin-")) continue;
  const src = join(packagesDir, entry.name, "src");
  try {
    for (const path of walk(src)) {
      if (hasModuleReference(read(path), "@kn/core")) {
        fail(path, "plugins must not import @kn/core");
      }
    }
  } catch {
    // Packages without a source directory have no import boundary to inspect.
  }
}

const coreTsconfig = join(root, "packages/core/tsconfig.json");
if (read(coreTsconfig).includes("../common/src")) {
  fail(coreTsconfig, "core must consume common through the package boundary");
}

const coreSrc = join(root, "packages/core/src");
for (const path of walk(coreSrc)) {
  const specifiers = getModuleSpecifiers(read(path));
  for (const specifier of specifiers) {
    if (!specifier.startsWith(".")) continue;
    const target = resolve(dirname(path), specifier);
    if (target === commonSrc || target.startsWith(`${commonSrc}${sep}`)) {
      fail(path, `core must not import common source directly (${specifier})`);
    }
  }
}

const forbiddenPatterns = [
  [
    join(root, "packages/common/src/index.ts"),
    /export\s*\*\s*from\s*["']\.\/hooks["']/,
    "the common root must export hooks explicitly to avoid forwarding useApi twice",
  ],
  [
    join(root, "packages/common/src/services/index.ts"),
    /export\s*\*\s*from\s*["']\.\/file-service["']/,
    "the services barrel must not forward file-service contract aliases to the root",
  ],
  [
    join(root, "packages/common/src/hooks/use-plugin-state.ts"),
    /from\s*["']\.\.["']/,
    "common internals must not import the package root barrel",
  ],
  [
    join(root, "packages/core/src/App.tsx"),
    /from\s*["']\.\/index["']/,
    "App must not import the core root barrel",
  ],
  [
    join(root, "packages/core/src/ai/tools/register.ts"),
    /from\s*["']\.\/index["']/,
    "tool registration must import concrete modules directly",
  ],
];

for (const [path, pattern, message] of forbiddenPatterns) {
  if (pattern.test(withoutComments(read(path)))) fail(path, message);
}

for (const path of walk(coreSrc)) {
  const source = withoutComments(read(path));
  if (
    /export\s*\*\s*from\s*["']@kn\/common["']/.test(source) &&
    relative(coreSrc, path) !== "legacy-core-api.ts"
  ) {
    fail(path, "only legacy-core-api.ts may forward the complete common surface");
  }
}

const kPluginDeclarations = walk(packagesDir).flatMap((path) => {
  const matches = withoutComments(read(path)).match(/\bclass\s+KPlugin\b/g) ?? [];
  return matches.map(() => path);
});
if (kPluginDeclarations.length !== 1) {
  failures.push(
    `Expected exactly one KPlugin runtime class declaration, found ${kPluginDeclarations.length}: ${kPluginDeclarations
      .map((path) => relative(root, path))
      .join(", ")}`,
  );
}

if (failures.length > 0) {
  console.error("Package boundary check failed:\n");
  failures.forEach((message) => console.error(`- ${message}`));
  process.exitCode = 1;
} else {
  console.log("Package boundary check passed");
}
