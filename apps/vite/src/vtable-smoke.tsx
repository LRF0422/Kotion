import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "@kn/ui/globals.css";

/**
 * VTableSheet proof of concept — a real-browser harness for the
 * jspreadsheet -> VTableSheet migration (see docs/VTABLE_MIGRATION.md).
 *
 * Why a browser page and not a Node test: VTable's ESM output uses extensionless
 * imports (`./components/vtable-sheet`), so Node cannot resolve it at all — only
 * a bundler can. That rules out the DOM-shim approach used to measure
 * jspreadsheet, so every VTable question has to be answered here.
 *
 * Visit /vtable-smoke.html with `pnpm app:dev` running. The panel reports what
 * the migration plan needs to know before an adapter is written, and
 * `window.__vtablePoc` exposes the live instance for further poking in DevTools.
 */

type SheetModule = typeof import("@visactor/vtable-sheet");

interface Check {
    name: string;
    ok: boolean | "info";
    detail: string;
}

const ROWS = Number(new URLSearchParams(location.search).get("rows") ?? 9000);
const COLUMNS = Number(new URLSearchParams(location.search).get("cols") ?? 12);

/** Rows shaped like a plausible spec sheet, so text measurement is realistic. */
function makeData(rows: number, columns: number) {
    return Array.from({ length: rows }, (_, r) => {
        const line: (string | number)[] = [];
        for (let c = 0; c < columns; c += 1) {
            if (c === 0) line.push(r + 1);
            else if (c === 1) line.push(`物料-${r + 1}`);
            else if (c === 2) line.push(`SKU${String(r + 1).padStart(6, "0")}`);
            else if (c === 3) line.push((r % 7) + 1);
            else if (c === 4) line.push(Math.round(((r * 37) % 1000) / 10) / 100);
            else if (c === 5) line.push(r % 2 === 0 ? "在库" : "缺货");
            else line.push((r + 1) * (c + 1));
        }
        return line;
    });
}

function VTablePoc() {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const sheetRef = useRef<any>(null);
    const [checks, setChecks] = useState<Check[]>([]);
    const [busy, setBusy] = useState(true);
    const [fatal, setFatal] = useState<string | null>(null);
    const [editEvents, setEditEvents] = useState(0);

    const record = useCallback((check: Check) => {
        setChecks((prev) => [...prev, check]);
    }, []);

    useEffect(() => {
        const host = hostRef.current;
        if (!host) return;
        let disposed = false;
        let sheet: any = null;

        (async () => {
            const results: Check[] = [];
            const push = (name: string, ok: boolean | "info", detail: string) => {
                results.push({ name, ok, detail });
            };

            // ── 1. Can the engine even load through Vite? ────────────────────
            const t0 = performance.now();
            let mod: SheetModule;
            try {
                mod = await import("@visactor/vtable-sheet");
            } catch (error) {
                setFatal(`import failed: ${(error as Error)?.message}`);
                setBusy(false);
                return;
            }
            push("import @visactor/vtable-sheet", true, `${(performance.now() - t0).toFixed(0)}ms`);

            const { VTableSheet } = mod as any;
            push("VTableSheet export", typeof VTableSheet === "function", typeof VTableSheet);

            // ── 2. Mount with the real workload ─────────────────────────────
            const data = makeData(ROWS, COLUMNS);
            const heapBefore = (performance as any).memory?.usedJSHeapSize ?? 0;
            const mountStart = performance.now();
            try {
                sheet = new VTableSheet(host, {
                    sheets: [
                        {
                            sheetTitle: "库存",
                            sheetKey: "stock",
                            rowCount: ROWS,
                            columnCount: COLUMNS,
                            data,
                            active: true,
                            // A formula over a whole column, to check that range
                            // semantics survive a large rowCount.
                            formulas: { G1: "=SUM(E1:E10)" },
                        },
                        {
                            sheetTitle: "汇总",
                            sheetKey: "summary",
                            rowCount: 50,
                            columnCount: 4,
                            data: Array.from({ length: 50 }, (_, r) => [r + 1, `行${r + 1}`, r * 2, r % 3]),
                        },
                    ],
                    // The host owns the toolbar, formula bar and undo buttons, so
                    // the engine's own chrome must be switchable off.
                    showFormulaBar: false,
                    showSheetTab: false,
                    mainMenu: { show: false },
                    undoRedo: { show: false },
                    defaultRowHeight: 23,
                    defaultColWidth: 96,
                });
            } catch (error) {
                setFatal(`construct failed: ${(error as Error)?.message}`);
                setBusy(false);
                return;
            }
            const mountMs = performance.now() - mountStart;
            sheetRef.current = sheet;
            // Exposed for a CDP client (and for the browser console). The probe
            // answers the questions the migration plan cannot answer statically:
            // whether the sheet's layout is built, where the container size comes
            // from, and whether formula/history APIs are actually wired.
            (window as any).__vtablePoc = {
                sheet,
                mod,
                probe: () => {
                    const lines: string[] = [];
                    const safe = (label: string, fn: () => unknown) => {
                        try {
                            lines.push(`${label} = ${JSON.stringify(fn())}`);
                        } catch (error) {
                            lines.push(`${label} THREW: ${String((error as Error)?.message).slice(0, 160)}`);
                        }
                    };
                    const ws: any = sheet.getWorkSheetByKey?.("stock");
                    const table: any = ws?.tableInstance;
                    const canvas = document.querySelector("canvas") as HTMLCanvasElement | null;
                    safe("dpr", () => window.devicePixelRatio);
                    safe("canvas w/h (attr)", () => (canvas ? [canvas.width, canvas.height] : "no canvas"));
                    safe("canvas client", () => (canvas ? [canvas.clientWidth, canvas.clientHeight] : "no canvas"));
                    safe("container rect", () => {
                        const el = document.querySelector('[data-spreadsheet-host="poc"]') ?? document.querySelector("div[style*='flex: 1']");
                        const r = el?.getBoundingClientRect();
                        return r ? [Math.round(r.width), Math.round(r.height)] : "none";
                    });
                    safe("table colCount/rowCount", () => (table ? [table.colCount, table.rowCount] : "no table"));
                    safe("layoutMap present", () => Boolean(table?.internalProps?.layoutMap));
                    safe("layoutMap.getBody(0,1)", () => {
                        const cell = table?.internalProps?.layoutMap?.getBody?.(0, 1);
                        return cell ? "present" : null;
                    });
                    safe("formulaManager", () => Boolean(sheet.getFormulaManager?.()));
                    safe("formulaEngine", () => Boolean(sheet.getFormulaManager?.()?.formulaEngine));
                    safe("considerFormula(G1)", () => ws?.getCellValueConsiderFormula?.(6, 0));
                    safe("plain(G1)", () => ws?.getCellValue?.(6, 0));
                    safe("historyManager", () => Boolean(sheet.getWorkbookHistoryManager?.()));
                    safe("worksheet methods", () =>
                        ws ? Object.keys(ws).filter((k) => typeof (ws as any)[k] === "function").sort() : []);
                    return lines.join("\n");
                },
            };

            const heapAfter = (performance as any).memory?.usedJSHeapSize ?? 0;
            push(
                `mount ${ROWS}×${COLUMNS}`,
                "info",
                `${mountMs.toFixed(0)}ms` +
                    (heapBefore && heapAfter
                        ? ` | heap ${(heapBefore / 1048576).toFixed(0)}→${(heapAfter / 1048576).toFixed(0)}MB`
                        : " | heap n/a (Chrome only)"),
            );

            // ── 3. Does it virtualize? Count DOM nodes actually in the table ─
            await new Promise((r) => setTimeout(r, 300));
            const cellNodes = host.querySelectorAll("td, tr, [class*=cell]").length;
            push(
                "DOM nodes under container",
                "info",
                `${cellNodes} (canvas rendering should keep this near-constant vs rows)`,
            );

            // ── 4. Read/write semantics + coordinate order ──────────────────
            const ws = sheet.getActiveSheet?.();
            push("getActiveSheet()", !!ws, ws ? `key=${ws.getKey?.()} title=${ws.getTitle?.()}` : "null");
            if (ws) {
                push("getRowCount()/getColumnCount()", ws.getRowCount?.() === ROWS, `${ws.getRowCount?.()} / ${ws.getColumnCount?.()}`);
                const raw = ws.getData?.();
                push(
                    "getData() shape",
                    Array.isArray(raw),
                    Array.isArray(raw) ? `${raw.length} rows, first=${JSON.stringify(raw[0])?.slice(0, 60)}` : typeof raw,
                );
                // Coordinate order is the single most error-prone mapping in the
                // adapter: ours is (row, col), WorkSheet's is (col, row).
                const v11 = ws.getCellValue?.(1, 1);
                push(
                    "getCellValue(1,1) — expect row1/col1 = '物料-2'",
                    v11 === "物料-2",
                    JSON.stringify(v11),
                );
                const vRow0 = ws.getCellValue?.(9, 0);
                push("getCellValue(9,0) — expect row9/col0 = 10", vRow0 === 10, JSON.stringify(vRow0));

                // Formula evaluation
                const formula = ws.getCellValueConsiderFormula?.(6, 0);
                push("formula G1 =SUM(E1:E10)", "info", `computed=${JSON.stringify(formula)} (expected 55 if 1..10)`);

                // ── 5. Edit event: the save pipeline depends on it ──────────
                let fired = 0;
                try {
                    sheet.onTableEvent?.("change_cell_value", () => {
                        fired += 1;
                        setEditEvents((n) => n + 1);
                    });
                    sheet.onTableEvent?.("CHANGE_CELL_VALUE", () => {
                        fired += 1;
                        setEditEvents((n) => n + 1);
                    });
                } catch (error) {
                    push("onTableEvent registration", false, (error as Error)?.message);
                }
                const beforeWrite = ws.getCellValue?.(2, 0);
                ws.setCellValue?.(2, 0, "POC-WRITE");
                await new Promise((r) => setTimeout(r, 60));
                const afterWrite = ws.getCellValue?.(2, 0);
                push(
                    "setCellValue → getCellValue round-trip",
                    afterWrite === "POC-WRITE",
                    `${JSON.stringify(beforeWrite)} → ${JSON.stringify(afterWrite)}`,
                );
                push(
                    "change event fired on programmatic write",
                    fired > 0 ? true : "info",
                    `handlers fired ${fired}× (programmatic writes may be silent — user edits must not be)`,
                );

                // ── 6. Selection ────────────────────────────────────────────
                const sel = ws.getSelection?.();
                push("getSelection()", "info", JSON.stringify(sel));

                // ── 7. Undo/redo ────────────────────────────────────────────
                try {
                    sheet.undo?.();
                    await new Promise((r) => setTimeout(r, 60));
                    const afterUndo = ws.getCellValue?.(2, 0);
                    push(
                        "undo() reverts the write",
                        afterUndo !== "POC-WRITE",
                        `value now ${JSON.stringify(afterUndo)}`,
                    );
                    sheet.redo?.();
                    await new Promise((r) => setTimeout(r, 60));
                    push("redo() re-applies", ws.getCellValue?.(2, 0) === "POC-WRITE", JSON.stringify(ws.getCellValue?.(2, 0)));
                } catch (error) {
                    push("undo/redo", false, (error as Error)?.message);
                }

                // ── 8. Multi-sheet ──────────────────────────────────────────
                push("sheet count", sheet.getSheetCount?.() === 2, String(sheet.getSheetCount?.()));
                try {
                    sheet.activateSheet?.("summary");
                    await new Promise((r) => setTimeout(r, 120));
                    const active = sheet.getActiveSheet?.();
                    push("activateSheet('summary')", active?.getKey?.() === "summary", String(active?.getKey?.()));
                } catch (error) {
                    push("activateSheet", false, (error as Error)?.message);
                }
            }

            // ── 8b. Formula pipeline ────────────────────────────────────────
            // Three separate questions, because they fail independently and the
            // difference decides whether the migration is viable:
            //   (a) does the engine compute the right answer?
            //   (b) does the cell display it (or keep showing the formula text)?
            //   (c) does editing a referenced cell recalculate dependents?
            if (ws) {
                const table = (ws as any).tableInstance
                const formulaManager = sheet.getFormulaManager?.()
                const engine = formulaManager?.formulaEngine

                const computed = (() => {
                    try {
                        return formulaManager?.getCellValue?.({ sheet: "stock", row: 1, col: 8 })?.value
                    } catch {
                        return undefined
                    }
                })()

                // (a) + (b): write a formula through the table, exactly as an edit
                // would reach it.
                try {
                    table?.changeCellValues?.(8, 1, [["=SUM(E1:E10)"]], false, true)
                } catch (error) {
                    push("formula write", false, (error as Error)?.message ?? "threw")
                }
                await new Promise((r) => setTimeout(r, 600))
                const stored = (() => {
                    try {
                        return ws.getCellValue?.(8, 1)
                    } catch {
                        return undefined
                    }
                })()
                push(
                    "(a) engine computes the formula",
                    computed === undefined ? "info" : typeof computed === "number",
                    `engine result = ${JSON.stringify(computed)} (E1..E10 sum)`,
                )
                push(
                    "(b) cell shows the computed value",
                    typeof stored === "number",
                    `stored/displayed = ${JSON.stringify(stored)} — a string means the cell still shows the formula text`,
                )

                // (c) dependent recalculation.
                try {
                    table?.changeCellValues?.(4, 0, [[100]], false, true)
                } catch {
                    // Reported by the next check instead.
                }
                await new Promise((r) => setTimeout(r, 800))
                const after = (() => {
                    try {
                        return formulaManager?.getCellValue?.({ sheet: "stock", row: 1, col: 8 })?.value
                    } catch {
                        return undefined
                    }
                })()
                push(
                    "(c) dependents recalculate (E1=100)",
                    after !== computed,
                    `engine now = ${JSON.stringify(after)} (expected ~${(Number(computed) || 0) + 100}); ` +
                        `engine sheetData E1 = ${JSON.stringify(engine?.sheetData?.get?.(0)?.[0]?.[4])} vs table E1 = ${JSON.stringify(ws.getCellValue?.(4, 0))}`,
                )
                push(
                    "formula engine ↔ table data in sync",
                    engine?.sheetData?.get?.(0)?.[0]?.[4] === ws.getCellValue?.(4, 0),
                    "the engine keeps its own sheetData copy; a mismatch is why recalculation cannot see edits",
                )
            }

            // ── 9. Chrome suppression actually took effect ──────────────────
            push(
                "engine chrome suppressed",
                !host.querySelector(".formula-bar, [class*=formulaBar], [class*=sheet-tab]"),
                "no formula bar / sheet tab inside container (host owns the UI)",
            );

            if (!disposed) {
                setChecks(results);
                setBusy(false);
            }
        })();

        return () => {
            disposed = true;
            try {
                sheetRef.current?.release?.();
            } catch {
                // Best effort.
            }
            sheetRef.current = null;
        };
    }, [record]);

    // Scrolling stress: how long does a large scroll take?
    const runScrollTest = useCallback(async () => {
        const host = hostRef.current;
        const sheet = sheetRef.current;
        if (!host || !sheet) return;
        const scroller = host.querySelector<HTMLElement>("[class*=body-container], [class*=scroll], canvas")?.parentElement ?? host;
        const samples: number[] = [];
        for (let i = 0; i < 30; i += 1) {
            const t = performance.now();
            scroller.scrollTop = (i / 30) * scroller.scrollHeight;
            await new Promise((r) => requestAnimationFrame(() => r(null)));
            samples.push(performance.now() - t);
        }
        const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
        const worst = Math.max(...samples);
        record({
            name: "scroll (30 frames)",
            ok: avg < 20 ? true : "info",
            detail: `avg ${avg.toFixed(1)}ms, worst ${worst.toFixed(1)}ms (16.7ms = 60fps)`,
        });
    }, [record]);

    const forceResize = useCallback(() => {
        try {
            sheetRef.current?.getActiveSheet?.()?.resize?.();
            record({ name: "resize()", ok: true, detail: "called on active sheet" });
        } catch (error) {
            record({ name: "resize()", ok: false, detail: (error as Error)?.message });
        }
    }, [record]);

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 10px", borderBottom: "1px solid #ddd", font: "13px system-ui" }}>
                <strong>VTableSheet POC</strong>
                <span style={{ color: "#666" }}>{ROWS}×{COLUMNS}</span>
                <button onClick={runScrollTest} disabled={busy}>scroll test</button>
                <button onClick={forceResize} disabled={busy}>resize()</button>
                <span style={{ marginLeft: "auto", color: "#666" }}>edit events: {editEvents}</span>
                <a href="?rows=20000&cols=12" style={{ color: "#06c" }}>20k rows</a>
                <a href="?rows=1000&cols=12" style={{ color: "#06c" }}>1k rows</a>
            </div>

            <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
                <div ref={hostRef} data-spreadsheet-host="poc" style={{ flex: 1, minWidth: 0, height: "100%" }} />
                <div style={{ width: 420, borderLeft: "1px solid #ddd", overflow: "auto", padding: 10, font: "12px/1.5 ui-monospace, monospace" }}>
                    {fatal && <div style={{ color: "#c00", marginBottom: 8 }}>FATAL: {fatal}</div>}
                    {busy && <div style={{ color: "#666" }}>running checks…</div>}
                    {checks.map((c, i) => (
                        <div key={i} style={{ marginBottom: 6, color: c.ok === false ? "#c00" : c.ok === "info" ? "#555" : "#080" }}>
                            <span>{c.ok === false ? "✗" : c.ok === "info" ? "•" : "✓"} </span>
                            <strong>{c.name}</strong>
                            <div style={{ color: "#555", paddingLeft: 12 }}>{c.detail}</div>
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

createRoot(document.getElementById("root")!).render(<VTablePoc />);
