import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { gzipSync } from "node:zlib";

const args = process.argv.slice(2);
const jsonOnly = args.includes("--json");
const targetArg = args.find((arg) => !arg.startsWith("--"));
const distDir = resolve(targetArg || "apps/vite/dist");
const manifestPath = join(distDir, ".vite", "manifest.json");

if (!existsSync(manifestPath)) {
  console.error(`Vite manifest not found: ${manifestPath}`);
  console.error(
    "Run the Web production build before generating the size report.",
  );
  process.exitCode = 1;
} else {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const records = Object.entries(manifest);
  const entryRecord = records.find(([, record]) => record.isEntry);

  if (!entryRecord) {
    console.error(`No application entry found in ${manifestPath}`);
    process.exitCode = 1;
  } else {
    const measureFile = (file) => {
      const content = readFileSync(join(distDir, file));
      return {
        file,
        raw: content.byteLength,
        gzip: gzipSync(content, { level: 6 }).byteLength,
      };
    };

    const collectManifestClosure = (
      startKey,
      includeDynamicImports = false,
    ) => {
      const visitedKeys = new Set();
      const files = new Set();

      const visit = (key) => {
        if (visitedKeys.has(key)) return;
        const record = manifest[key];
        if (!record) return;

        visitedKeys.add(key);
        if (record.file) files.add(record.file);
        for (const cssFile of record.css || []) files.add(cssFile);
        for (const assetFile of record.assets || []) files.add(assetFile);
        for (const importedKey of record.imports || []) visit(importedKey);
        if (includeDynamicImports) {
          for (const importedKey of record.dynamicImports || [])
            visit(importedKey);
        }
      };

      visit(startKey);
      return { keys: [...visitedKeys], files: [...files] };
    };

    const sumMeasurements = (measurements) =>
      measurements.reduce(
        (total, item) => ({
          raw: total.raw + item.raw,
          gzip: total.gzip + item.gzip,
        }),
        { raw: 0, gzip: 0 },
      );

    const measureClosure = (startKey, includeDynamicImports = false) => {
      const closure = collectManifestClosure(startKey, includeDynamicImports);
      const assets = closure.files.map(measureFile);
      const codeAndCssAssets = assets.filter((asset) =>
        /\.(?:js|css)$/.test(asset.file),
      );
      const referencedAssets = assets.filter(
        (asset) => !/\.(?:js|css)$/.test(asset.file),
      );

      return {
        manifestEntries: closure.keys.length,
        files: assets.length,
        ...sumMeasurements(assets),
        codeAndCss: {
          files: codeAndCssAssets.length,
          ...sumMeasurements(codeAndCssAssets),
        },
        referencedAssets: {
          files: referencedAssets.length,
          ...sumMeasurements(referencedAssets),
        },
        assets: assets.sort((a, b) => b.raw - a.raw),
      };
    };

    const walkFiles = (directory) =>
      readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) return walkFiles(path);
        if (!entry.isFile()) return [];
        return [relative(distDir, path)];
      });

    const allDistFiles = walkFiles(distDir)
      .filter((file) => file !== ".vite/manifest.json")
      .map(measureFile)
      .sort((a, b) => b.raw - a.raw);

    const dynamicRecords = records.filter(
      ([, record]) => !record.isEntry && record.isDynamicEntry,
    );
    const bundledPluginsRecord = dynamicRecords.find(
      ([key, record]) =>
        key.endsWith("src/bundled-plugins.ts") ||
        record.src?.endsWith("src/bundled-plugins.ts"),
    );

    const [entryKey, entry] = entryRecord;
    const initial = measureClosure(entryKey);
    const shareBootstrap = bundledPluginsRecord
      ? measureClosure(bundledPluginsRecord[0])
      : null;
    const shareReachable = bundledPluginsRecord
      ? measureClosure(bundledPluginsRecord[0], true)
      : null;

    const report = {
      distDir,
      entry: { key: entryKey, file: entry.file },
      initial,
      shareBootstrap,
      shareReachable,
      total: {
        files: allDistFiles.length,
        ...sumMeasurements(allDistFiles),
        assets: allDistFiles,
      },
      chunks: {
        static: records.filter(([, record]) => !record.isDynamicEntry).length,
        dynamic: dynamicRecords.length,
      },
    };

    if (jsonOnly) {
      await new Promise((resolveWrite, rejectWrite) => {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`, (error) =>
          error ? rejectWrite(error) : resolveWrite(),
        );
      });
    } else {
      const formatBytes = (bytes) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KiB`;
        return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
      };

      const printSummary = (label, data) => {
        if (!data) {
          console.log(`${label}: not emitted`);
          return;
        }
        console.log(
          `${label}: ${formatBytes(data.raw)} raw / ${formatBytes(data.gzip)} gzip (${data.files} files)`,
        );
        if (data.codeAndCss && data.referencedAssets) {
          console.log(
            `  code/css ${formatBytes(data.codeAndCss.raw)} raw / ${formatBytes(data.codeAndCss.gzip)} gzip; referenced assets ${formatBytes(data.referencedAssets.raw)} raw / ${formatBytes(data.referencedAssets.gzip)} gzip`,
          );
        }
      };

      console.log(`Web bundle report: ${basename(distDir)}`);
      printSummary("Initial static closure", initial);
      printSummary("Share bootstrap closure", shareBootstrap);
      printSummary("Share maximum reachable closure", shareReachable);
      printSummary("Full dist", report.total);
      console.log(
        `Manifest chunks: ${report.chunks.static} static / ${report.chunks.dynamic} dynamic`,
      );
      console.log("\nLargest assets:");
      console.table(
        allDistFiles.slice(0, 10).map((asset) => ({
          file: asset.file,
          raw: formatBytes(asset.raw),
          gzip: formatBytes(asset.gzip),
        })),
      );
    }
  }
}
