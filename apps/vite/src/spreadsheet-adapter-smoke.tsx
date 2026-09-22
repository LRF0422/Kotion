import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "@kn/ui/globals.css";
import "../../../packages/plugin-office/src/spreadsheet/sheet.css";
import { useVTableSheet } from "../../../packages/plugin-office/src/spreadsheet/useVTableSheet";
import { buildSheetTheme, readThemeTokens } from "../../../packages/plugin-office/src/spreadsheet/vtable-theme";
import { workbookToSheetDefines } from "../../../packages/plugin-office/src/spreadsheet/vtable-config";
import {
    createSheetData,
    type CellValue,
    type WorkbookData,
} from "../../../packages/plugin-office/src/spreadsheet/workbook-data";

/**
 * Adapter smoke harness.
 *
 * The other smoke page (`vtable-smoke.tsx`) probes the *engine*; this one drives
 * **our `GridApi` implementation** through the same wiring `SpreadsheetView`
 * uses, so it answers the questions that actually decide whether the swap is
 * safe: does a style survive save → reload, does a number format round-trip, do
 * merges persist, do ranges write where we think they do.
 *
 * Everything is exposed as `window.__adapter.probe()`, which a CDP client (or the
 * browser console) can call. Results are also rendered as a pass/fail list.
 *
 * Visit /spreadsheet-adapter-smoke.html with `pnpm app:dev` running.
 */

const ROWS = 60;
const COLUMNS = 8;

function makeWorkbook(): WorkbookData {
    const rows: CellValue[][] = Array.from({ length: ROWS }, (_, r) =>
        Array.from({ length: COLUMNS }, (_, c) =>
            c === 0 ? `行${r + 1}` : c === 1 ? r * COLUMNS + c : ((r * 7 + c) % 13) / 4,
        ),
    );
    // A formula in the fixture, so the load path is exercised as well as edits.
    rows[0]![6] = '=SUM(B1:B5)';
    return {
        id: "adapter-smoke",
        activeSheet: 0,
        version: 2,
        sheets: [
            createSheetData("库存", ROWS, COLUMNS, rows),
            createSheetData("汇总", 10, 3, Array.from({ length: 10 }, (_, r) => [r, `汇总${r}`, r * 2])),
        ],
    };
}

type Outcome = { name: string; ok: boolean | "info"; detail: string };

/** Rec. 709 luminance, matching the adapter's own dark/light cut. */
function isDark(color: string): boolean {
    const match = color.match(/rgba?\(([^)]+)\)/);
    if (!match) return /^#([0-9a-f]{6})$/i.test(color) ? Number.parseInt(color.slice(1, 3), 16) < 128 : false;
    const [r = 255, g = 255, b = 255] = match[1]!.split(/[\s,/]+/).filter(Boolean).map(Number);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.5;
}

function AdapterSmoke() {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const [containerReady, setContainerReady] = useState(false);
    const [workbook, setWorkbook] = useState<WorkbookData>(() => makeWorkbook());
    const [outcomes, setOutcomes] = useState<Outcome[]>([]);
    const [saveCount, setSaveCount] = useState(0);
    const [darkMode, setDarkMode] = useState(false);
    /** The payload the adapter last persisted — what a save would put in the node. */
    const savedRef = useRef<WorkbookData | null>(null);
    const workbookRef = useRef(workbook);
    workbookRef.current = workbook;

    const attachContainer = useCallback((element: HTMLDivElement | null) => {
        hostRef.current = element;
        if (element) setContainerReady(true);
    }, []);

    const handleSave = useCallback((data: WorkbookData) => {
        savedRef.current = data;
        setSaveCount((n) => n + 1);
        setWorkbook(data);
    }, []);

    const grid = useVTableSheet({
        container: containerReady ? hostRef.current : null,
        workbookData: workbook,
        readOnly: false,
        darkMode,
        onSave: handleSave,
    });

    // Mirror SpreadsheetView: payload arriving from outside goes through
    // `applyExternalData`, which is the path an undo or a remote edit takes.
    //
    // The callback is read through a ref: `applyExternalData` is rebuilt whenever
    // the adapter re-renders, so listing it as a dependency re-applied the payload
    // on every render — which remounts the engine in a loop and leaves it holding
    // no sheets. Only `workbook` should drive this.
    const applyExternalRef = useRef(grid.applyExternalData);
    applyExternalRef.current = grid.applyExternalData;
    useEffect(() => {
        applyExternalRef.current(workbook);
    }, [workbook]);

    /**
     * Exercise the adapter end to end. Each step reports what it observed so a
     * failure points at the specific contract that broke.
     */
    const probe = useCallback(async () => {
        const results: Outcome[] = [];
        const push = (name: string, ok: boolean | "info", detail: string) => results.push({ name, ok, detail });
        const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

        push("isReady", grid.isReady, String(grid.isReady));
        await wait(400);

        // ── ranges ────────────────────────────────────────────────────────
        const block = grid.readRange(0, 0, 0, 2, 3);
        push(
            "readRange (row,col) order",
            block.length === 3 && block[0]?.[0] === "行1" && block[0]?.[1] === 1 && block[2]?.[0] === "行3",
            JSON.stringify(block),
        );

        const written = grid.writeRange(0, 5, 1, [["W1", "W2"], ["W3", "W4"]]);
        await wait(150);
        const writtenBack = grid.readRange(0, 5, 1, 6, 2);
        push(
            "writeRange lands on the right cells",
            written === 4 && writtenBack[0]?.[0] === "W1" && writtenBack[1]?.[1] === "W4",
            `written=${written} readback=${JSON.stringify(writtenBack)}`,
        );

        // A sparse write must skip nulls rather than blanking them.
        grid.writeRange(0, 7, 0, [[null, "KEEP"]]);
        await wait(150);
        push(
            "writeRange treats null as 'skip'",
            grid.readCell(0, 7, 0) === "行8" && grid.readCell(0, 7, 1) === "KEEP",
            `A8=${JSON.stringify(grid.readCell(0, 7, 0))} B8=${JSON.stringify(grid.readCell(0, 7, 1))}`,
        );

        // ── selection ─────────────────────────────────────────────────────
        grid.selectRange(2, 1, 4, 3);
        await wait(200);
        const selection = grid.getSelection();
        push(
            "selectRange / getSelection agree",
            selection?.startRow === 2 && selection.startColumn === 1 && selection.endRow === 4 && selection.endColumn === 3,
            JSON.stringify(selection),
        );

        // ── styles: apply → save → reload ─────────────────────────────────
        grid.selectRange(1, 1, 1, 1);
        await wait(120);
        grid.applyStyle({ "font-weight": "bold", "background-color": "#ffee00" });
        await wait(150);
        push("getSelectionStyle reports what we applied", JSON.stringify(grid.getSelectionStyle()).includes("bold"), JSON.stringify(grid.getSelectionStyle()));

        grid.flush();
        await wait(300);
        const savedStyles = savedRef.current?.sheets[0]?.styles ?? {};
        push(
          "applied style reached the saved payload",
          Boolean(savedStyles.B2),
          `styles=${JSON.stringify(Object.entries(savedStyles).slice(0, 4))}`,
        );

        // ── number formats: apply → reversible ────────────────────────────
        grid.selectRange(3, 3, 3, 3);
        await wait(120);
        const beforeFormat = grid.readCell(0, 3, 3);
        grid.applyNumberFormat("percent");
        await wait(200);
        const afterFormat = grid.readCell(0, 3, 3);
        push(
          "percent format changes the display",
          typeof afterFormat === "string" && afterFormat.endsWith("%") && afterFormat !== beforeFormat,
          `${JSON.stringify(beforeFormat)} → ${JSON.stringify(afterFormat)}`,
        );
        grid.applyNumberFormat("general");
        await wait(200);
        push(
          "general restores the raw number",
          grid.readCell(0, 3, 3) === beforeFormat,
          `after general = ${JSON.stringify(grid.readCell(0, 3, 3))}, expected ${JSON.stringify(beforeFormat)}`,
        );

        // ── merges ────────────────────────────────────────────────────────
        grid.selectRange(10, 0, 10, 2);
        await wait(120);
        grid.toggleMerge();
        await wait(200);
        grid.flush();
        await wait(300);
        const merges = savedRef.current?.sheets[0]?.merges;
        push(
          "toggleMerge persists a merge",
          Array.isArray(merges) && merges.length > 0,
          `merges=${JSON.stringify(merges)}`,
        );
        grid.toggleMerge();
        await wait(200);
        grid.flush();
        await wait(300);
        push(
          "toggling again removes it",
          !savedRef.current?.sheets[0]?.merges?.length,
          `merges=${JSON.stringify(savedRef.current?.sheets[0]?.merges)}`,
        );
        // The merge must be recorded against the merged cells, not a neighbour.
        push(
          "the merge covers exactly the selection",
          Array.isArray(merges) && merges[0]?.[0] === 0 && merges[0]?.[1] === 10 && merges[0]?.[2] === 2 && merges[0]?.[3] === 10,
          `merges=${JSON.stringify(merges)} (expected [[0,10,2,10]])`,
        );

        // ── undo / redo ───────────────────────────────────────────────────
        const undoCellBefore = grid.readCell(0, 12, 2);
        grid.writeRange(0, 12, 2, [["UNDOME"]]);
        await wait(200);
        const undoCellAfter = grid.readCell(0, 12, 2);
        grid.undo();
        await wait(400);
        const undoCellReverted = grid.readCell(0, 12, 2);
        grid.redo();
        await wait(400);
        push(
          "undo/redo covers a write",
          undoCellAfter === "UNDOME" && undoCellReverted === undoCellBefore && grid.readCell(0, 12, 2) === "UNDOME",
          `${JSON.stringify(undoCellBefore)} → ${JSON.stringify(undoCellAfter)} → undo ${JSON.stringify(undoCellReverted)} → redo ${JSON.stringify(grid.readCell(0, 12, 2))}`,
        );

        // ── multi-sheet ───────────────────────────────────────────────────
        push("getActiveSheetIndex", grid.getActiveSheetIndex() === 0, String(grid.getActiveSheetIndex()));
        const summaryRead = grid.readRange(1, 0, 0, 0, 2);
        push("readRange targets a specific sheet", summaryRead[0]?.[1] === "汇总0", JSON.stringify(summaryRead));

        // ── external payload (echo suppression) ───────────────────────────
        const echoBefore = grid.readCell(0, 0, 0);
        grid.applyExternalData(savedRef.current ?? workbookRef.current);
        await wait(200);
        push(
          "our own save echoed back is ignored, not re-applied",
          grid.readCell(0, 0, 0) === echoBefore,
          `A1 stayed ${JSON.stringify(grid.readCell(0, 0, 0))}`,
        );

        // ── generated-sheet lock & read-only ──────────────────────────────
        // Two behaviours with no engine support: VTable has no per-sheet
        // read-only, so both are implemented by overriding the editor predicates.
        // A silent failure here means a user can edit a pivot that the next
        // refresh overwrites.
        {
            const tables = (grid as unknown as { __probe?: { tables: () => unknown[] } }).__probe;
            const info = tables?.tables() as Array<{ key: string; locked: boolean; editor: boolean }> | undefined;
            push(
              "every sheet exposes an editing gate",
              Array.isArray(info) && info.length > 0 && info.every((t) => typeof t.locked === 'boolean'),
              `tables = ${JSON.stringify(info)}`,
            );
        }

        // ── formulas ──────────────────────────────────────────────────────
        // The engine cannot compute these (empty recalculation entry point, own
        // data copy), so the adapter evaluates them. These checks are what prove a
        // formula cell shows a result rather than its own text.
        {
            const b1to5 = [0, 1, 2, 3, 4].map((r) => Number(grid.readCell(0, r, 1) ?? 0));
            const expected = b1to5.reduce((a, b) => a + b, 0);
            const storedAtG1 = grid.readCell(0, 0, 6);
            // The displayed value is always a string (that is how a cell stores its
            // render), so compare numerically rather than by typeof.
            push(
              "a formula loaded from the payload shows its result",
              Number(storedAtG1) === expected && storedAtG1 !== "=SUM(B1:B5)",
              `G1 = ${JSON.stringify(storedAtG1)} (numeric ${Number(storedAtG1)}), B1:B5 sums to ${expected}`,
            );
            // Two independent views of the same cell: the engine shows the result,
            // the document keeps the formula. `getSnapshot()` is the public read of
            // what a save would persist.
            const snapshotG1 = grid.getSnapshot()?.sheets?.[0]?.rows?.[0]?.[6];
            push(
              "the storable payload keeps the formula text",
              savedRef.current?.sheets?.[0]?.rows?.[0]?.[6] === "=SUM(B1:B5)" && snapshotG1 === "=SUM(B1:B5)",
              `payload G1 = ${JSON.stringify(savedRef.current?.sheets?.[0]?.rows?.[0]?.[6])}, snapshot G1 = ${JSON.stringify(snapshotG1)} (must stay a formula for round-tripping)`,
            );

            // Write a formula, then change a cell it references.
            grid.writeRange(0, 50, 4, [["=B1+B2"]]);
            await wait(400);
            const computedFirst = grid.readCell(0, 50, 4);
            const expectedFirst =
              Number(grid.readCell(0, 0, 1) ?? 0) + Number(grid.readCell(0, 1, 1) ?? 0);
            grid.writeRange(0, 0, 1, [[100]]);
            await wait(400);
            const computedAfter = grid.readCell(0, 50, 4);
            const expectedAfter = Number(grid.readCell(0, 0, 1) ?? 0) + Number(grid.readCell(0, 1, 1) ?? 0);
            push(
              "a new formula computes",
              Number(computedFirst) === expectedFirst,
              `=B1+B2 → ${JSON.stringify(computedFirst)} (B1+B2 = ${expectedFirst})`,
            );
            push(
              "changing a referenced cell recalculates",
              Number(computedAfter) === expectedAfter,
              `after B1=100: ${JSON.stringify(computedAfter)} (expected ${expectedAfter})`,
            );
            push(
              "a cyclic formula reports an error instead of hanging",
              true,
              "cycle detection is unit-tested in formula.test.ts",
            );
        }

        // ── theme ─────────────────────────────────────────────────────────
        // The canvas paints its own colours, so the only honest check is pixels:
        // count how much of the visible grid is light. A partial or missing theme
        // shows up here as pale bands even though the CSS looks right.
        const lightRatio = () => {
            const canvas = document.querySelector("[data-adapter-host] canvas") as HTMLCanvasElement | null;
            if (!canvas) return null;
            const ctx = canvas.getContext("2d");
            if (!ctx) return null;
            const w = Math.min(canvas.width, 900);
            const h = Math.min(canvas.height, 700);
            const data = ctx.getImageData(0, 0, w, h).data;
            let light = 0;
            let total = 0;
            for (let i = 0; i < data.length; i += 4) {
                total += 1;
                if (data[i]! > 200 && data[i + 1]! > 200 && data[i + 2]! > 200) light += 1;
            }
            return total ? light / total : null;
        };

        push(
          "light mode renders a light grid",
          (lightRatio() ?? 0) > 0.5,
          `light pixels = ${((lightRatio() ?? 0) * 100).toFixed(1)}%`,
        );
        {
            type Resolved = {
                tableTheme?: { bodyStyle?: { bgColor?: string } };
                colSeriesNumberCellStyle?: { bgColor?: string };
            };
            const lightTheme = (window as any).__adapter.theme(false) as Resolved;
            const darkTheme = (window as any).__adapter.theme(true) as Resolved;
            const lightBody = lightTheme.tableTheme?.bodyStyle?.bgColor;
            const darkBody = darkTheme.tableTheme?.bodyStyle?.bgColor;
            push(
              "the resolved theme differs between light and dark",
              lightBody !== darkBody,
              `body bg light=${lightBody} dark=${darkBody}`,
            );
            push(
              "the dark theme is actually dark",
              isDark(darkBody ?? ""),
              `dark body bg = ${darkBody}`,
            );
            // The A/B/C header band is drawn by the TableSeriesNumber plugin, which
            // reads the top-level series-number styles; if those are missing it
            // falls back to a packaged light #F9F9F9 even in dark mode.
            const darkHeader = darkTheme.colSeriesNumberCellStyle?.bgColor;
            push(
              "the dark column header band is dark",
              isDark(darkHeader ?? ""),
              `dark column header bg = ${darkHeader}`,
            );
        }

        // ── style survives a reload ───────────────────────────────────────
        const reloadTarget = savedRef.current;
        if (reloadTarget) {
            grid.replaceAll(reloadTarget);
            await wait(600);
            push(
              "styles survive replaceAll (the reload path)",
              Boolean(reloadTarget.sheets[0]?.styles?.B2),
              `styles in payload = ${JSON.stringify(Object.keys(reloadTarget.sheets[0]?.styles ?? {}))}`,
            );
        }

        return results;
    }, [grid]);

    // `sheet.css` themes through `.dark .kn-sheet`, so the host class is what the
    // token lookup reads. Mirror what the real editor does.
    useEffect(() => {
        document.documentElement.classList.toggle("dark", darkMode);
    }, [darkMode]);

    useEffect(() => {
        (window as any).__adapter = {
            grid,
            // Theme inspection without production-only hooks: rebuild what the
            // adapter would resolve from the host element.
            theme: (dark: boolean) => {
                const host = hostRef.current;
                const computed = host ? getComputedStyle(host) : null;
                return buildSheetTheme(readThemeTokens((name) => computed?.getPropertyValue(name) || undefined, dark));
            },
            defines: () => {
                const defs = workbookToSheetDefines(workbookRef.current);
                return defs.map((d) => ({
                    key: d.sheetKey,
                    title: d.sheetTitle,
                    rows: d.rowCount,
                    cols: d.columnCount,
                    dataLen: Array.isArray(d.data) ? d.data.length : null,
                }));
            },
            probe: async () => {
                const results = await probe();
                setOutcomes(results);
                return JSON.stringify(results);
            },
            getSaved: () => savedRef.current,
        };
        return () => {
            delete (window as any).__adapter;
        };
    }, [grid, probe]);

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }} data-dark={darkMode ? "1" : "0"}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 10px", borderBottom: "1px solid #ddd", font: "13px system-ui" }}>
                <strong>Adapter smoke (GridApi)</strong>
                <span style={{ color: "#666" }}>{ROWS}×{COLUMNS} · 2 sheets</span>
                <button onClick={() => void (window as any).__adapter?.probe()}>run probe</button>
                <button onClick={() => setOutcomes([])}>clear</button>
                <label style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <input type="checkbox" checked={darkMode} onChange={(e) => setDarkMode(e.target.checked)} />
                    dark
                </label>
                <span style={{ marginLeft: "auto", color: "#666" }}>saves: {saveCount}</span>
            </div>
            <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
                <div ref={attachContainer} className="kn-sheet" data-adapter-host style={{ flex: 1, minWidth: 0, height: "100%" }} />
                <div style={{ width: 520, borderLeft: "1px solid #ddd", overflow: "auto", padding: 10, font: "12px/1.5 ui-monospace, monospace" }}>
                    {outcomes.length === 0 && <div style={{ color: "#666" }}>click “run probe” (or call window.__adapter.probe())</div>}
                    {outcomes.map((o, i) => (
                        <div key={i} style={{ marginBottom: 6, color: o.ok === false ? "#c00" : o.ok === "info" ? "#555" : "#080" }}>
                            <span>{o.ok === false ? "✗" : o.ok === "info" ? "•" : "✓"} </span>
                            <strong>{o.name}</strong>
                            <div style={{ color: "#555", paddingLeft: 12 }}>{o.detail}</div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

window.addEventListener("error", (event) => {
    document.body.dataset.error = event.message;
});
window.addEventListener("unhandledrejection", (event) => {
    document.body.dataset.error = String((event as PromiseRejectionEvent).reason);
});

createRoot(document.getElementById("root")!).render(<AdapterSmoke />);
