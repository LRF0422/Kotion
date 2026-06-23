import { NodeViewProps, NodeViewWrapper } from "@kn/editor"
import { useTheme } from "@kn/ui"
import { X } from "@kn/icon"
import React, { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useUniver } from "./useUniver"
import { triggerExcelFileImport, parseExcelToUniverData } from "./excel-to-univer"
import { downloadWorkbookAsExcel } from "./univer-to-excel"

export const SpreadsheetView: React.FC<NodeViewProps> = React.memo((props) => {
    const { node, updateAttributes, editor } = props
    const { height } = node.attrs
    const { theme } = useTheme()
    const containerRef = useRef<HTMLDivElement>(null)
    const [isFullscreen, setIsFullscreen] = useState(false)
    // Capture initial workbookData once — subsequent attr changes are ignored
    // because the Univer instance is the source of truth during editing.
    const initialDataRef = useRef<Record<string, any> | null>(node.attrs.workbookData)

    // ESC to exit fullscreen
    useEffect(() => {
        if (!isFullscreen) return
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setIsFullscreen(false)
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [isFullscreen])

    const handleSave = useCallback(
        (data: Record<string, any>) => {
            updateAttributes({ workbookData: data })
        },
        [updateAttributes],
    )

    // Use a ref so the Univer plugin callback always calls the latest version
    const importWorkbookDataRef = useRef<(data: Record<string, any>) => void>(() => {})

    const handleImportExcel = useCallback(async () => {
        const file = await triggerExcelFileImport()
        if (!file) return
        try {
            const data = await parseExcelToUniverData(file)
            importWorkbookDataRef.current(data)
        } catch (e) {
            console.error('Failed to import Excel:', e)
        }
    }, [])

    // Export uses the live snapshot so unsaved edits are included.
    const getCurrentSnapshotRef = useRef<() => Record<string, any> | null>(() => null)
    const handleExportExcel = useCallback(() => {
        try {
            const snapshot = getCurrentSnapshotRef.current() ?? node.attrs.workbookData
            downloadWorkbookAsExcel(snapshot, 'spreadsheet.xlsx')
        } catch (e) {
            console.error('Failed to export Excel:', e)
        }
    }, [node.attrs.workbookData])

    const { importWorkbookData, applyWorkbookData, getCurrentSnapshot } = useUniver({
        containerRef,
        workbookData: initialDataRef.current,
        readOnly: !editor.isEditable,
        darkMode: theme === 'dark',
        onSave: handleSave,
        onImportExcel: handleImportExcel,
        onExportExcel: handleExportExcel,
        onToggleFullscreen: () => setIsFullscreen((prev) => !prev),
    })

    // Keep refs in sync
    importWorkbookDataRef.current = importWorkbookData
    getCurrentSnapshotRef.current = getCurrentSnapshot

    // Reflect external edits (e.g. AI tools writing to node attrs) into the live
    // Univer instance. The hook ignores echoes of its own saves via reference check.
    useEffect(() => {
        const data = node.attrs.workbookData
        if (data) applyWorkbookData(data)
    }, [node.attrs.workbookData, applyWorkbookData])

    // Toolbar for fullscreen mode only (close button)
    const fullscreenToolbar = (
        <div className="flex items-center gap-1 border-b px-2 py-1">
            <div className="flex-1" />
            <button
                className="inline-flex items-center justify-center rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                onClick={() => setIsFullscreen(false)}
                title="退出全屏"
            >
                <X className="h-4 w-4" />
            </button>
        </div>
    )

    // Fullscreen: portal to document.body to escape parent stacking context
    // The editor wrapper creates a stacking context (z-30) that caps child z-index.
    const fullscreenOverlay = isFullscreen
        ? createPortal(
            <div className="fixed inset-0 z-[9998] flex flex-col bg-background">
                {fullscreenToolbar}
                <div
                    ref={containerRef}
                    className="flex-1"
                    style={{ height: '100%' }}
                />
            </div>,
            document.body
        )
        : null

    return (
        <NodeViewWrapper className="relative my-2 rounded-md border shadow-sm">
            {!isFullscreen && (
                <div
                    ref={containerRef}
                    style={{ height }}
                />
            )}
            {fullscreenOverlay}
        </NodeViewWrapper>
    )
}, (prevProps, nextProps) => {
    return prevProps.node.attrs.height === nextProps.node.attrs.height
        && prevProps.node.attrs.workbookData === nextProps.node.attrs.workbookData
        && prevProps.editor.isEditable === nextProps.editor.isEditable
})

SpreadsheetView.displayName = 'SpreadsheetView'
