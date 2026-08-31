import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const [owner, ...externalTrees] = process.argv.slice(2);
if (!owner) {
  throw new Error("Usage: node normalize-declaration-layout.mjs <package-dir> [external-tree ...]");
}

const dist = resolve("dist");

const mergeDirectory = (source, target) => {
  if (!existsSync(source)) return;
  mkdirSync(target, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const sourcePath = join(source, entry.name);
    const targetPath = join(target, entry.name);
    if (entry.isDirectory()) {
      mergeDirectory(sourcePath, targetPath);
    } else {
      mkdirSync(resolve(targetPath, ".."), { recursive: true });
      writeFileSync(targetPath, readFileSync(sourcePath));
    }
  }
};

const candidates = [
  join(dist, owner, "src"),
  join(dist, "packages", owner, "src"),
];

// Remove declarations emitted for external workspace packages before merging the
// owner's source tree. Doing this first preserves a legitimate owner directory
// whose name happens to match an external package (for example src/common).
for (const tree of externalTrees) {
  rmSync(join(dist, basename(tree)), { recursive: true, force: true });
}

for (const source of candidates) {
  mergeDirectory(source, dist);
}

for (const source of candidates) {
  rmSync(source, { recursive: true, force: true });
}

rmSync(join(dist, "packages"), { recursive: true, force: true });

if (!existsSync(join(dist, "index.d.ts"))) {
  throw new Error(`Declaration entry was not normalized to ${join(dist, "index.d.ts")}`);
}
