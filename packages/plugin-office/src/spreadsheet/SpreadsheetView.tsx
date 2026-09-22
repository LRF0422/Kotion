import { NodeViewProps, NodeViewWrapper } from "@kn/editor"
import { useResolvedTheme } from "@kn/ui"
import { X } from "@kn/icon"
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useVTableSheet } from "./useVTableSheet"
import { SheetToolbar } from "./SheetToolbar"
import { SheetFormulaBar } from "./SheetFormulaBar"
import { PivotDialog } from "./PivotDialog"
import { PivotDetailsDialog, type PivotDrillTarget } from "./PivotDetailsDialog"
import { pickExcelFileFromCenter } from "./excel-file-picker"
import { registerSpreadsheetLive, unregisterSpreadsheetLive, type SpreadsheetLiveHandle } from "./workbook-registry"
import { DEFAULT_SPREADSHEET_HEIGHT } from "./constants"
import { ensureValidWorkbookData, workbookHasContent, type WorkbookData } from "./workbook-data"
import { translate } from "../i18n"
import "./sheet.css"

/**
 * Spreadsheet node view.
 *
 * The grid is a VTableSheet canvas with no React tree of its own, so this
 * component gives it a box, renders the toolbar and forwards actions. The widget
 * is created once per mount and destroyed on unmount; fullscreen moves the
 * element rather than rebuilding it.
 */
export const SpreadsheetView: React.FC<NodeViewProps> = React.memo((props) => {
    const { node, editor, getPos } = props
    const height = typeof node.attrs.height === 'number' ? node.attrs.height : DEFAULT_SPREADSHEET_HEIGHT
    // Resolves "system" to the active mode, so a dark UI does not get a light grid.
    const darkMode = useResolvedTheme() === 'dark'

    const nodeHostRef = useRef<HTMLDivElement | null>(null)
    const fullscreenHostRef = useRef<HTMLDivElement | null>(null)
    const containerRef = useRef<HTMLDivElement | null>(null)

    const [showFullscreen, setShowFullscreen] = useState(false)
    const [pivotOpen, setPivotOpen] = useState(false)
    const [pivotTarget, setPivotTarget] = useState<PivotDrillTarget | null>(null)
    const [importError, setImportError] = useState<string | null>(null)
    const [containerReady, setContainerReady] = useState(false)
    // Bumped on selection change so the toolbar re-reads its own state.
    const [selectionVersion, setSelectionVersion] = useState(0)

    const attachContainer = useCallback((element: HTMLDivElement | null) => {
        containerRef.current = element
        if (element) setContainerReady(true)
    }, [])

    // Capture the initial payload once; after mount the live grid is the source
    // of truth for editing, and the node attribute is the sink.
    const initialDataRef = useRef<WorkbookData | null>(null)
    if (initialDataRef.current === null) {
        initialDataRef.current = ensureValidWorkbookData(node.attrs.workbookData)
    }
    const initialData = initialDataRef.current

    // The last payload this view persisted, so an empty snapshot produced during a
    // remount can never replace a populated document payload.
    const lastSavedRef = useRef<WorkbookData | null>(initialData)

    const handleSave = useCallback(
        (data: WorkbookData) => {
            if (editor.isDestroyed) return
            if (!workbookHasContent(data) && workbookHasContent(lastSavedRef.current)) {
                // Defence in depth: a grid that has not rendered yet reports empty
                // data, and persisting that would silently wipe the document.
                console.warn('[office/spreadsheet] refused to persist an empty snapshot over existing data')
                return
            }
            lastSavedRef.current = data
            try {
                const pos = getPos()
                if (typeof pos !== 'number') return
                const docNode = editor.state.doc.nodeAt(pos)
                if (!docNode || docNode.type.name !== 'spreadsheet') return
                // Dispatch by hand so the auto-save is kept out of the document
                // undo history: otherwise Ctrl+Z outside the grid would step back
                // through dozens of autosave snapshots. Cell edits remain undoable
                // through the grid's own history.
                const transaction = editor.state.tr.setNodeMarkup(pos, undefined, {
                    ...docNode.attrs,
                    workbookData: data,
                })
                transaction.setMeta('addToHistory', false)
                editor.view.dispatch(transaction)
            } catch {
                // The node view was torn down between edit and save; dropping the
                // snapshot is correct — the editor no longer owns this node.
            }
        },
        [editor, getPos],
    )

    const handleSelectionChange = useCallback(() => {
        setSelectionVersion((version) => version + 1)
    }, [])

    // ESC exits fullscreen (the toolbar also has an explicit close button).
    useEffect(() => {
        if (!showFullscreen) return
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setShowFullscreen(false)
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [showFullscreen])

    const closeFullscreen = useCallback(() => setShowFullscreen(false), [])

    const getSnapshotRef = useRef<(() => WorkbookData | null) | null>(null)
    const replaceRef = useRef<((data: WorkbookData) => void) | null>(null)

    const handleImportExcel = useCallback(async () => {
        const { file, error } = await pickExcelFileFromCenter(editor)
        if (error) {
            setImportError(error)
            return
        }
        if (!file) return
        try {
            const { parseExcelToWorkbook } = await import("./excel-to-workbook")
            const data = await parseExcelToWorkbook(file)
            replaceRef.current?.(data)
            setImportError(null)
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            setImportError(message)
            console.error('[office/spreadsheet] Excel import failed:', error)
        }
    }, [])

    const handleExportExcel = useCallback(async () => {
        try {
            const snapshot = getSnapshotRef.current?.()
            if (!snapshot) {
                setImportError(translate('spreadsheet.exportEmpty'))
                return
            }
            const { downloadWorkbookAsExcel } = await import("./workbook-to-excel")
            downloadWorkbookAsExcel(snapshot, 'spreadsheet.xlsx')
        } catch (error) {
            console.error('[office/spreadsheet] Excel export failed:', error)
            setImportError(error instanceof Error ? error.message : String(error))
        }
    }, [])

    const gridOptions = {
        container: containerReady ? containerRef.current : null,
        workbookData: initialData,
        readOnly: !editor.isEditable,
        darkMode,
        onSave: handleSave,
        onImportExcel: handleImportExcel,
        onExportExcel: handleExportExcel,
        onSelectionChange: handleSelectionChange,
        onPivotDrillDown: setPivotTarget,
    }

    const grid = useVTableSheet(gridOptions)

    const { getSnapshot, replaceAll, applyExternalData, writeRange, isReady } = grid
    replaceRef.current = replaceAll
    getSnapshotRef.current = getSnapshot
    const applyExternalDataRef = useRef(applyExternalData)
    applyExternalDataRef.current = applyExternalData

    // Keep the grid element in exactly one host. Moving the element preserves the
    // widget; only its box changes.
    useLayoutEffect(() => {
        const element = containerRef.current
        if (!element) return
        const host = showFullscreen ? fullscreenHostRef.current : nodeHostRef.current
        if (!host) return
        if (element.parentElement !== host) host.appendChild(element)
    }, [containerReady, showFullscreen])

    // Reflect payload that changed outside this view (AI tool, undo, sync).
    // Exact echoes of our own save are ignored inside the hook.
    useEffect(() => {
        const data = node.attrs.workbookData
        if (data) applyExternalData(ensureValidWorkbookData(data))
    }, [node.attrs.workbookData, applyExternalData])

    // Publish the live grid to the AI tool layer so reads are current and writes
    // land as normal edits instead of replacing the workbook.
    useEffect(() => {
        if (!isReady) return
        const handle: SpreadsheetLiveHandle = {
            getSnapshot: () => getSnapshot(),
            setRangeValues: (sheetIndex, startRow, startColumn, data, options) =>
                writeRange(sheetIndex, startRow, startColumn, data, options),
            isEditable: () => editor.isEditable,
        }
        registerSpreadsheetLive(node, handle)
        return () => unregisterSpreadsheetLive(node)
    }, [isReady, node, getSnapshot, writeRange, editor])

    const renderToolbar = (fullscreen: boolean) => (
        <SheetToolbar
            grid={grid}
            disabled={!isReady || !editor.isEditable}
            refreshKey={selectionVersion}
            onImport={handleImportExcel}
            onExport={handleExportExcel}
            onFullscreen={() => setShowFullscreen((prev) => (fullscreen ? false : !prev))}
            onCreatePivot={() => setPivotOpen(true)}
            isFullscreen={fullscreen}
        />
    )

    const renderFormulaBar = () => (
        <SheetFormulaBar
            grid={grid}
            refreshKey={selectionVersion}
            disabled={!isReady}
            readOnly={!editor.isEditable}
        />
    )

    return (
        <>
            <NodeViewWrapper className="kn-sheet not-prose relative my-2 rounded-md border shadow-sm">
                {importError && (
                    <div className="flex items-center gap-2 border-b bg-destructive/10 px-2 py-1 text-xs text-destructive">
                        <span className="truncate" title={importError}>{importError}</span>
                        <button
                            type="button"
                            className="ml-auto rounded p-0.5 hover:bg-destructive/20"
                            onClick={() => setImportError(null)}
                            aria-label={translate('spreadsheet.close')}
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    </div>
                )}
                {renderToolbar(false)}
                {renderFormulaBar()}
                <div
                    ref={nodeHostRef}
                    className="kn-sheet__canvas kn-sheet__canvas--inline"
                    style={{ height }}
                    data-spreadsheet-host="node-view"
                >
                    <div ref={attachContainer} className="h-full w-full" data-spreadsheet-container />
                </div>
            </NodeViewWrapper>
            <PivotDialog open={pivotOpen} onOpenChange={setPivotOpen} grid={grid} />
            <PivotDetailsDialog
                target={pivotTarget}
                onOpenChange={(open) => { if (!open) setPivotTarget(null) }}
                grid={grid}
            />
            <FullscreenSheet
                open={showFullscreen}
                hostRef={fullscreenHostRef}
                onClose={closeFullscreen}
                toolbar={renderToolbar(true)}
                formulaBar={renderFormulaBar()}
            />
        </>
    )
}, (prevProps, nextProps) => {
    return prevProps.node.attrs.height === nextProps.node.attrs.height
        && prevProps.node.attrs.workbookData === nextProps.node.attrs.workbookData
        && prevProps.editor.isEditable === nextProps.editor.isEditable
})

/**
 * Fullscreen overlay. Always mounted (hidden when closed) so the grid element can
 * simply be moved into it and back.
 */
const FullscreenSheet: React.FC<{
    open: boolean
    hostRef: { current: HTMLDivElement | null }
    onClose: () => void
    toolbar: React.ReactNode
    formulaBar: React.ReactNode
}> = React.memo(({ open, hostRef, onClose, toolbar, formulaBar }) => createPortal(
    <div
        className="kn-sheet fixed inset-0 z-[9998] flex-col bg-background"
        style={{ display: open ? 'flex' : 'none' }}
    >
        <div className="flex items-center gap-1 border-b px-2 py-1">
            <span className="text-xs font-medium text-muted-foreground">{translate('spreadsheet.title')}</span>
            <div className="flex-1" />
            <button
                type="button"
                className="inline-flex items-center justify-center rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                onClick={onClose}
                title={translate('spreadsheet.exitFullscreen')}
                aria-label={translate('spreadsheet.exitFullscreen')}
            >
                <X className="h-4 w-4" />
            </button>
        </div>
        {toolbar}
        {formulaBar}
        <div
            ref={(element) => { hostRef.current = element }}
            className="kn-sheet__canvas kn-sheet__canvas--fullscreen min-h-0 flex-1"
            data-spreadsheet-host="fullscreen"
        />
    </div>,
    document.body,
))
FullscreenSheet.displayName = 'FullscreenSheet'

SpreadsheetView.displayName = 'SpreadsheetView'
