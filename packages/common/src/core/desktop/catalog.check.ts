/**
 * Desktop capability catalogue drift check.
 *
 * The catalogue (`./catalog.ts`) is the agent-facing description of what the
 * desktop host exposes. Descriptions are cheap; being *wrong* is expensive — an
 * agent that believes a capability exists (or misses a guard rail) writes a
 * plugin that fails only in front of the user. So the catalogue is pinned to the
 * four places a capability actually lives:
 *
 *   1. `./capabilities.ts`        — the `DesktopCapability` union (names);
 *   2. `apps/desktop/src/preload` — the invoke whitelist (transport);
 *   3. `apps/desktop/src/main`    — the `desktop:<name>` handler (behaviour);
 *   4. `./catalog.ts`             — summary, guards, access, example.
 *
 * Anything one-sided fails here: a capability in the union with no catalogue
 * entry, a whitelisted capability nobody handles, a catalogue entry whose
 * example calls a different name, a group without a domain module, …
 *
 * Run with: pnpm --filter @kn/common check:desktop-capabilities
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";

import {
  DESKTOP_CAPABILITY_BRIDGE_PATHS,
  DESKTOP_CAPABILITY_CATALOG,
  DESKTOP_CAPABILITY_GUARDS,
  DESKTOP_CAPABILITY_GROUPS,
  desktopCapabilityCall,
  desktopCapabilityGuards,
  findDesktopCapabilityMeta,
} from "./catalog";
import type { DesktopCapabilityGroup, DesktopCapabilityMeta } from "./catalog";

let checks = 0;

const assert = (condition: unknown, message: string): void => {
  checks += 1;
  if (!condition) throw new Error(message);
};

/** Walk up until the repo root (the one holding apps/desktop) is found. */
const findRepoRoot = (): string => {
  let current = __dirname;
  for (let depth = 0; depth < 8; depth++) {
    if (existsSync(join(current, "apps", "desktop", "src", "preload", "index.ts"))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error("check: cannot locate the repo root from " + __dirname);
};

const read = (root: string, path: string): string => readFileSync(join(root, path), "utf8");

/** Quoted capability-style names (`group.something`) inside a source slice. */
const CAPABILITY_NAME = /'([a-z]+(?:\.[A-Za-z][A-Za-z0-9]*)+)'/g;

const namesIn = (source: string): string[] => {
  const names: string[] = [];
  for (const match of source.matchAll(CAPABILITY_NAME)) {
    if (!names.includes(match[1])) names.push(match[1]);
  }
  return names;
};

const walkTs = (dir: string, acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== "node_modules" && entry !== "out" && entry !== "dist") walkTs(full, acc);
    } else if (entry.endsWith(".ts") && !entry.endsWith(".d.ts") && !entry.endsWith(".check.ts")) {
      acc.push(full);
    }
  }
  return acc;
};

const catalogNames: string[] = DESKTOP_CAPABILITY_CATALOG.map((meta) => meta.name);
const catalog = DESKTOP_CAPABILITY_CATALOG as readonly DesktopCapabilityMeta[];

/** 1. Exactly one catalogue entry per capability, no duplicates, no strays. */
const definitionChecks = (root: string): void => {
  const source = read(root, "packages/common/src/core/desktop/capabilities.ts");
  const unionStart = source.indexOf("export type DesktopCapability =");
  assert(unionStart >= 0, "capabilities.ts must declare DesktopCapability");
  const unionBlock = source.slice(unionStart).split("\n\n")[0];
  const unionNames = namesIn(unionBlock);

  assert(unionNames.length > 90, "DesktopCapability union looks truncated: " + unionNames.length);
  assert(
    new Set(unionNames).size === unionNames.length,
    "DesktopCapability union contains duplicate names",
  );
  assert(
    new Set(catalogNames).size === catalogNames.length,
    "the catalogue contains duplicate names",
  );

  const missing = unionNames.filter((name) => !catalogNames.includes(name));
  const extra = catalogNames.filter((name) => !unionNames.includes(name));
  assert(missing.length === 0, "capabilities missing from the catalogue: " + missing.join(", "));
  assert(extra.length === 0, "catalogue names that are not capabilities: " + extra.join(", "));
  assert(
    catalogNames.length === unionNames.length,
    `catalogue/union size mismatch: ${catalogNames.length} vs ${unionNames.length}`,
  );

  // The payload table must cover the names one-for-one too (typecheck would
  // catch a missing member, but not a stale extra one left behind).
  const contractSource = read(root, "packages/common/src/core/desktop/contract.ts");
  const contractNames = [...contractSource.matchAll(/^ {4}'([a-z]+(?:\.[A-Za-z][A-Za-z0-9]*)+)':/gm)].map(
    (match) => match[1],
  );
  assert(contractNames.length > 90, "contract.ts entries look truncated: " + contractNames.length);
  const contractMissing = unionNames.filter((name) => !contractNames.includes(name));
  const contractExtra = contractNames.filter((name) => !unionNames.includes(name));
  assert(
    contractMissing.length === 0 && contractExtra.length === 0,
    "contract.ts and the union disagree. missing: " +
      contractMissing.join(", ") +
      " | extra: " +
      contractExtra.join(", "),
  );
};

/** 2. The preload whitelist is the transport: everything must be listed. */
const preloadChecks = (root: string): void => {
  const source = read(root, "apps/desktop/src/preload/index.ts");
  const start = source.indexOf("const CAPABILITIES = [");
  const end = source.indexOf("] as readonly string[]", start);
  assert(start >= 0 && end > start, "preload must declare a CAPABILITIES whitelist");
  const whitelisted = namesIn(source.slice(start, end));

  const notWhitelisted = catalogNames.filter((name) => !whitelisted.includes(name));
  assert(
    notWhitelisted.length === 0,
    "capabilities the host exposes but preload refuses: " + notWhitelisted.join(", "),
  );

  // Host-internal channels that are deliberately not plugin capabilities: the
  // confirmation window answers its own prompts through them, and the app window
  // must not be able to answer them itself.
  const HOST_INTERNAL = [
    "dialog.confirm.context",
    "dialog.confirmResize",
    "dialog.confirmResult",
  ];
  const internal = whitelisted.filter((name) => !catalogNames.includes(name));
  const undocumented = internal.filter((name) => !HOST_INTERNAL.includes(name));
  const stale = HOST_INTERNAL.filter((name) => !internal.includes(name));
  assert(
    undocumented.length === 0,
    "new preload capabilities without a catalogue entry: " + undocumented.join(", "),
  );
  assert(stale.length === 0, "host-internal list is stale, missing: " + stale.join(", "));
};

/** 3. Every capability has a main-process handler. */
const handlerChecks = (root: string): void => {
  const mainDir = join(root, "apps/desktop/src/main");
  const handled = new Set<string>();
  for (const file of walkTs(mainDir)) {
    const source = readFileSync(file, "utf8");
    const code = source
      .split("\n")
      .filter((line) => {
        const trimmed = line.trim();
        return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
      })
      .join("\n");
    for (const match of code.matchAll(/handle\('([a-z]+(?:\.[A-Za-z][A-Za-z0-9]*)+)'/g)) {
      handled.add(match[1]);
    }
    for (const match of code.matchAll(
      /ipcMain\.handle\('desktop:([a-z]+(?:\.[A-Za-z][A-Za-z0-9]*)+)'/g,
    )) {
      handled.add(match[1]);
    }
  }
  const unhandled = catalogNames.filter((name) => !handled.has(name));
  assert(
    unhandled.length === 0,
    "capabilities with no main-process handler under apps/desktop/src/main: " +
      unhandled.join(", "),
  );
};

/** 4. Groups: one per domain, each with a module and at least one capability. */
const groupChecks = (root: string): void => {
  const ids = DESKTOP_CAPABILITY_GROUPS.map((group) => group.id);
  assert(new Set(ids).size === ids.length, "duplicate capability group ids");
  for (const group of DESKTOP_CAPABILITY_GROUPS) {
    const members = DESKTOP_CAPABILITY_CATALOG.filter((meta) => meta.group === group.id);
    assert(members.length > 0, "capability group '" + group.id + "' has no capabilities");
    assert(
      existsSync(join(root, group.typesAt)),
      "group '" + group.id + "' points at a missing types module: " + group.typesAt,
    );
    assert(
      group.typesAt === "packages/common/src/storage/types.ts" ||
        group.typesAt.startsWith("packages/common/src/core/desktop/"),
      "group '" + group.id + "' must live under the desktop module: " + group.typesAt,
    );
  }
  const unknownGroup = DESKTOP_CAPABILITY_CATALOG.filter(
    (meta) => !ids.includes(meta.group as DesktopCapabilityGroup),
  );
  assert(unknownGroup.length === 0, "catalogue entries use an unknown group");
};

/** 5. Metadata hygiene: call shape, guards, examples, availability. */
const metadataChecks = (): void => {
  for (const meta of catalog) {
    const call = desktopCapabilityCall(meta);
    if (meta.access.via === "invoke") {
      assert(
        call.includes(`desktop.invoke('${meta.name}'`),
        "invoke call shape for " + meta.name + " is wrong: " + call,
      );
    } else {
      assert(
        call.startsWith(DESKTOP_CAPABILITY_BRIDGE_PATHS[meta.access.bridge]),
        "bridge call shape for " + meta.name + " is wrong: " + call,
      );
    }
    assert(meta.summary.trim().length > 0, "capability " + meta.name + " has no summary");
    for (const guard of desktopCapabilityGuards(meta)) {
      assert(
        typeof DESKTOP_CAPABILITY_GUARDS[guard] === "string",
        "capability " + meta.name + " uses an undocumented guard: " + guard,
      );
    }
    if (meta.example) {
      if (meta.example.includes("desktop.invoke(")) {
        assert(
          meta.example.includes(meta.name),
          "example of " + meta.name + " invokes a different capability:\n" + meta.example,
        );
      }
      if (meta.access.via === "bridge") {
        const path = DESKTOP_CAPABILITY_BRIDGE_PATHS[meta.access.bridge];
        assert(
          meta.example.includes(path) || meta.example.includes("desktop."),
          "example of " + meta.name + " does not use its bridge: " + path,
        );
      }
    }
    if (meta.group === "dev") {
      assert(
        meta.availability === "desktop-studio",
        "dev capability " + meta.name + " must be marked desktop-studio only",
      );
    }
  }
};

/** 6. The lookup helpers agree with the table. */
const helperChecks = (): void => {
  for (const meta of catalog) {
    assert(findDesktopCapabilityMeta(meta.name)?.name === meta.name, "lookup failed for " + meta.name);
  }
  assert(findDesktopCapabilityMeta("nope.nothing") === undefined, "unknown names must not resolve");
};

const run = (): void => {
  const root = findRepoRoot();
  definitionChecks(root);
  preloadChecks(root);
  handlerChecks(root);
  groupChecks(root);
  metadataChecks();
  helperChecks();
  console.log(
    `desktop capability catalogue checks passed (${checks} assertions, ${catalogNames.length} capabilities, ${DESKTOP_CAPABILITY_GROUPS.length} groups) — root: ${relative(process.cwd(), root) || "."}`,
  );
};

try {
  run();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}