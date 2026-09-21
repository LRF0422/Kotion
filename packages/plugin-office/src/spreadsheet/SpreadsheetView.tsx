import { NodeViewProps, NodeViewWrapper } from "@kn/editor"
import { useResolvedTheme } from "@kn/ui"
import { X } from "@kn/icon"
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useJspreadsheet } from "./useJspreadsheet"
import { SheetToolbar } from "./SheetToolbar"
import { pickExcelFile } from "./excel-file-picker"
import { registerSpreadsheetLive, unregisterSpreadsheetLive, type SpreadsheetLiveHandle } from "./workbook-registry"
import { DEFAULT_SPREADSHEET_HEIGHT } from "./constants"
import { ensureValidWorkbookData, workbookHasContent, type WorkbookData } from "./workbook-data"
import "./sheet.css"

/**
 * Spreadsheet node view.
 *
 * The grid is jspreadsheet: a plain DOM widget with no React tree of its own, so
 * this component gives it a box, renders the toolbar and forwards actions. The
 * widget is created once per mount and destroyed on unmount; fullscreen moves the
 * element rather than rebuilding it.
 */
export const SpreadsheetView: React.FC<NodeViewProps> = React.memo((props) => {
    const { node, updateAttributes, editor } = props
    const height = typeof node.attrs.height === 'number' ? node.attrs.height : DEFAULT_SPREADSHEET_HEIGHT
    // Resolves "system" to the active mode, so a dark UI does not get a light grid.
    const darkMode = useResolvedTheme() === 'dark'

    const nodeHostRef = useRef<HTMLDivElement | null>(null)
    const fullscreenHostRef = useRef<HTMLDivElement | null>(null)
    const containerRef = useRef<HTMLDivElement | null>(null)

    const [showFullscreen, setShowFullscreen] = useState(false)
    const [importError, setImportError] = useState<string | null>(null)
    const [containerReady, setContainerReady] = useState(false)
    // Bumped on selection change so the toolbar re-reads its own state.
    const [selectionVersion, setSelectionVersion] = useState(0)

    const attachContainer = useCallback((element: HTMLDivElement | null) => {
        containerRef.current = element
        if (element) setContainerReady(true)
    }, [])

    // Capture the initial payload once; after mount the live grid is the source
    // of truth for editing, and the node attributes are the persistence sink.
    const initialDataRef = useRef<WorkbookData>(ensureValidWorkbookData(node.attrs.workbookData))

    // The last payload this view persisted, so an empty snapshot produced during a
    // remount can never replace a populated document payload.
    const lastSavedRef = useRef<WorkbookData | null>(initialDataRef.current)

    const handleSave = useCallback(
        (data: WorkbookData) => {
            if (editor.isDestroyed) return
            if (!workbookHasContent(data) && workbookHasContent(lastSavedRef.current)) {
                // Defence in depth: a grid that has not rendered yet reports empty
                // data, and persisting that would silently wipe the document.
                console.warn('[office/spreadsheet] refused to persist an empty snapshot over existing data')
                return
            }
            try {
                lastSavedRef.current = data
                updateAttributes({ workbookData: data })
            } catch {
                // The node view was torn down between edit and save; dropping the
                // snapshot is correct — the editor no longer owns this node.
            }
        },
        [editor, updateAttributes],
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
        const { file, error } = await pickExcelFile()
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
                setImportError('当前表格没有可导出的数据')
                return
            }
            const { downloadWorkbookAsExcel } = await import("./workbook-to-excel")
            downloadWorkbookAsExcel(snapshot, 'spreadsheet.xlsx')
        } catch (error) {
            console.error('[office/spreadsheet] Excel export failed:', error)
            setImportError(error instanceof Error ? error.message : String(error))
        }
    }, [])

    const grid = useJspreadsheet({
        container: containerReady ? containerRef.current : null,
        workbookData: initialDataRef.current,
        readOnly: !editor.isEditable,
        darkMode,
        onSave: handleSave,
        onImportExcel: handleImportExcel,
        onExportExcel: handleExportExcel,
        onSelectionChange: handleSelectionChange,
    })

    const { getSnapshot, replaceAll, applyExternalData, writeRange, isReady } = grid
    replaceRef.current = replaceAll
    getSnapshotRef.current = getSnapshot

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
    // Echoes of our own save keep the same workbook id and are ignored.
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
            setRangeValues: (sheetIndex, startRow, startColumn, data) =>
                writeRange(sheetIndex, startRow, startColumn, data),
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
            isFullscreen={fullscreen}
        />
    )

    return (
        <>
            <NodeViewWrapper className="kn-sheet relative my-2 rounded-md border shadow-sm">
                {importError && (
                    <div className="flex items-center gap-2 border-b bg-destructive/10 px-2 py-1 text-xs text-destructive">
                        <span className="truncate" title={importError}>{importError}</span>
                        <button
                            type="button"
                            className="ml-auto rounded p-0.5 hover:bg-destructive/20"
                            onClick={() => setImportError(null)}
                            aria-label="关闭"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    </div>
                )}
                {renderToolbar(false)}
                <div
                    ref={nodeHostRef}
                    className="kn-sheet__canvas kn-sheet__canvas--inline"
                    style={{ height }}
                    data-spreadsheet-host="node-view"
                >
                    <div ref={attachContainer} className="h-full w-full" data-spreadsheet-container />
                </div>
            </NodeViewWrapper>
            <FullscreenSheet
                open={showFullscreen}
                hostRef={fullscreenHostRef}
                onClose={closeFullscreen}
                toolbar={renderToolbar(true)}
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
}> = React.memo(({ open, hostRef, onClose, toolbar }) => createPortal(
    <div
        className="kn-sheet fixed inset-0 z-[9998] flex-col bg-background"
        style={{ display: open ? 'flex' : 'none' }}
    >
        <div className="flex items-center gap-1 border-b px-2 py-1">
            <span className="text-xs font-medium text-muted-foreground">电子表格</span>
            <div className="flex-1" />
            <button
                type="button"
                className="inline-flex items-center justify-center rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                onClick={onClose}
                title="退出全屏"
            >
                <X className="h-4 w-4" />
            </button>
        </div>
        {toolbar}
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
