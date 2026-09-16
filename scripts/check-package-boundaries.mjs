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
      const source = read(path);
      if (hasModuleReference(source, "@kn/core")) {
        fail(path, "plugins must not import @kn/core");
      }
      // Desktop capabilities are consumed through the `desktop` service from
      // @kn/common — never through electron or the preload globals.
      if (hasModuleReference(source, "electron")) {
        fail(path, "plugins must not import electron; use the desktop service from @kn/common");
      }
      if (/(window|globalThis)\s*\.\s*(electron|electronAPI|api|knDesktop)\b/.test(withoutComments(source))) {
        fail(path, "plugins must not touch the desktop preload globals directly; use the desktop service from @kn/common");
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
  // The agent SDK must consume the injected AgentTransport contract instead of
  // hard-coding the product gateway path or the auth/session policy.
  [
    join(root, "packages/common/src/ai/agent/client.ts"),
    /authorizedFetch|\/api\/knowledge-agent|utils\/session/,
    "the agent SDK must not embed the product gateway/auth policy; use AgentTransport",
  ],
  // The sub-agent label map is owned by @kn/ui; hosts must call the shared
  // builder instead of re-declaring the same 18 i18n keys.
  [
    join(root, "packages/core/src/ai/system-agent/AIAssistantPanel.tsx"),
    /title:\s*t\(['"]ai\.chat\.subAgentTitle['"]\)/,
    "the panel must build sub-agent labels via @kn/ui buildSubAgentTreeLabels(t)",
  ],
  [
    join(root, "packages/plugin-ai/src/ai/menu/MessageBubble.tsx"),
    /title:\s*t\(['"]ai\.chat\.subAgentTitle['"]\)/,
    "the message bubble must build sub-agent labels via @kn/ui buildSubAgentTreeLabels(t)",
  ],
  // The off-screen target cap/lease policy lives in the extracted hook.
  [
    join(root, "packages/plugin-ai/src/ai/menu/Chat.tsx"),
    /MAX_OFFSCREEN_TARGETS/,
    "the off-screen target cap belongs to useOffscreenTargets, not Chat",
  ],
];

for (const [path, pattern, message] of forbiddenPatterns) {
  if (pattern.test(withoutComments(read(path)))) fail(path, message);
}

// The agent SDK must not embed browser storage/lock policy: implementations are
// registered by @kn/core through the AgentPersistence contract.
const agentSdkDir = join(root, "packages/common/src/ai/agent");
for (const path of walk(agentSdkDir)) {
  if (/localStorage|navigator\.locks/.test(withoutComments(read(path)))) {
    fail(path, "the agent SDK must not use browser storage/lock policy; register AgentPersistence from core");
  }
}

// Positive assertions: some seams must exist for the layering to hold.
const requiredPatterns = [
  [
    join(root, "packages/common/src/ai/agent/client.ts"),
    /from\s*["']\.\/transport["']/,
    "the SDK client must resolve its transport from the AgentTransport contract",
  ],
  [
    join(root, "packages/core/src/ai/agent/runtime.ts"),
    /configureAgentTransport/,
    "core must register the concrete AgentTransport at startup",
  ],
  [
    join(root, "packages/core/src/ai/tools/page-tools.ts"),
    /context\?\.sessionBinding/,
    "page tools must resolve the session binding from the tool execution context",
  ],
  [
    join(root, "packages/plugin-ai/src/ai/menu/Chat.tsx"),
    /from\s*["']\.\/use-offscreen-targets["']/,
    "the chat surface must delegate off-screen target management to useOffscreenTargets",
  ],
  [
    join(root, "packages/ui/src/components/ai/index.ts"),
    /buildSubAgentTreeLabels/,
    "@kn/ui must export buildSubAgentTreeLabels for hosts",
  ],
];

for (const [path, pattern, message] of requiredPatterns) {
  if (!pattern.test(withoutComments(read(path)))) fail(path, message);
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
