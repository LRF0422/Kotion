import { NodeViewProps, NodeViewWrapper } from "@kn/editor"
import { useTheme } from "@kn/ui"
import { Maximize2, X } from "@kn/icon"
import React, { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useUniver } from "./useUniver"
import { triggerExcelFileImport, parseExcelToUniverData } from "./excel-to-univer"

export const SpreadsheetView: React.FC<NodeViewProps> = React.memo((props) => {
    const { node, updateAttributes, editor } = props
    const { height } = node.attrs
    const { theme } = useTheme()
    const containerRef = useRef<HTMLDivElement>(null)
    const [importing, setImporting] = useState(false)
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

    const { importWorkbookData } = useUniver({
        containerRef,
        workbookData: initialDataRef.current,
        readOnly: !editor.isEditable,
        darkMode: theme === 'dark',
        onSave: handleSave,
    })

    const handleImportExcel = useCallback(async () => {
        const file = await triggerExcelFileImport()
        if (!file) return
        setImporting(true)
        try {
            const data = await parseExcelToUniverData(file)
            importWorkbookData(data)
        } finally {
            setImporting(false)
        }
    }, [importWorkbookData])

    // Toolbar shared between inline and fullscreen modes
    const toolbar = (
        <div className="flex items-center gap-1 border-b px-2 py-1">
            {editor.isEditable && (
                <button
                    className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
                    onClick={handleImportExcel}
                    disabled={importing}
                >
                    {importing ? '导入中...' : '导入 Excel'}
                </button>
            )}
            <div className="flex-1" />
            <button
                className="inline-flex items-center justify-center rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                onClick={() => setIsFullscreen(!isFullscreen)}
                title={isFullscreen ? '退出全屏' : '放大编辑'}
            >
                {isFullscreen
                    ? <X className="h-4 w-4" />
                    : <Maximize2 className="h-4 w-4" />
                }
            </button>
        </div>
    )

    // Fullscreen: portal to document.body to escape parent stacking context
    // The editor wrapper creates a stacking context (z-30) that caps child z-index.
    const fullscreenOverlay = isFullscreen
        ? createPortal(
            <div className="fixed inset-0 z-[9998] flex flex-col bg-background">
                {toolbar}
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
                <>
                    {toolbar}
                    <div
                        ref={containerRef}
                        style={{ height }}
                    />
                </>
            )}
            {fullscreenOverlay}
        </NodeViewWrapper>
    )
}, (prevProps, nextProps) => {
    return prevProps.node.attrs.height === nextProps.node.attrs.height
        && prevProps.editor.isEditable === nextProps.editor.isEditable
})

SpreadsheetView.displayName = 'SpreadsheetView'
