import { NodeViewProps, NodeViewWrapper } from "@kn/editor"
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useDebounce, useTranslation } from "@kn/common"
import { EmptyState, Button, Card, CardContent, useTheme } from "@kn/ui"
import Editor, { Monaco } from '@monaco-editor/react';
import { HelpCircle, GitBranch, ArrowRightLeft, Network, ZoomIn, ZoomOut, RotateCcw, CopyIcon, DownloadIcon, Maximize2, Pencil, Check } from "@kn/icon"
import RenderMermaid from "../../component"
import { normalizePersistedMermaidSource } from "./mermaid-source-normalization"

const MIN_ZOOM = 0.25
const MAX_ZOOM = 5
const ZOOM_STEP = 0.25

const handleDownloadSvg = (
    mermaidRef: React.RefObject<HTMLDivElement | null>
) => {
    if (mermaidRef.current) {
        const svgElement = mermaidRef.current.querySelector("svg");
        if (svgElement) {
            const svgData = new XMLSerializer().serializeToString(svgElement);
            const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
            const svgUrl = URL.createObjectURL(svgBlob);
            const downloadLink = document.createElement("a");
            downloadLink.href = svgUrl;
            downloadLink.download = "mermaid-diagram.svg";
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);
            URL.revokeObjectURL(svgUrl);
        }
    }
};

export const MermaidView: React.FC<NodeViewProps> = (props) => {

    const persistedSource = typeof props.node.attrs.data === 'string' ? props.node.attrs.data : ''
    const editorRef = useRef<Monaco>();
    const previewRef = useRef<HTMLDivElement | null>(null);
    const diagramRef = useRef<HTMLDivElement | null>(null);
    const cardRef = useRef<HTMLDivElement | null>(null);
    const codeRef = useRef(persistedSource)
    const lastPersistedSourceRef = useRef(persistedSource)
    const normalizationVersionRef = useRef(0)
    const { theme } = useTheme()
    const { t } = useTranslation()
    const isEditable = props.editor.isEditable
    const isDark = theme === 'dark'
    const [code, setCode] = useState(persistedSource)
    const [isNormalizing, setIsNormalizing] = useState(true)
    const [zoom, setZoom] = useState(1)
    const [isFullscreen, setIsFullscreen] = useState(false)
    // Click-to-edit: start in edit mode if no code yet (new block)
    const [isEditing, setIsEditing] = useState(!persistedSource)
    const value = useDebounce(code, {
        wait: 500,
    })

    useEffect(() => {
        codeRef.current = code
    }, [code])

    useEffect(() => {
        const source = persistedSource
        const previousPersistedSource = lastPersistedSourceRef.current
        const localSourceAtStart = codeRef.current
        const canApply = localSourceAtStart === previousPersistedSource || localSourceAtStart === source
        const version = ++normalizationVersionRef.current
        lastPersistedSourceRef.current = source

        if (!canApply) {
            setIsNormalizing(false)
            return
        }

        let cancelled = false
        setIsNormalizing(true)
        void normalizePersistedMermaidSource(source).then((result) => {
            if (cancelled || version !== normalizationVersionRef.current) return
            if (codeRef.current !== localSourceAtStart && codeRef.current !== source) return

            if (result.source !== codeRef.current) {
                codeRef.current = result.source
                setCode(result.source)
            }
            lastPersistedSourceRef.current = result.source
            setIsNormalizing(false)

            if (result.changed && isEditable && props.node.attrs.data === source) {
                props.updateAttributes({ data: result.source })
            }
        })

        return () => {
            cancelled = true
        }
    }, [isEditable, persistedSource, props.node.attrs.data, props.updateAttributes])

    useEffect(() => {
        if (
            !isEditable ||
            isNormalizing ||
            value !== codeRef.current ||
            value === props.node.attrs.data ||
            value === lastPersistedSourceRef.current
        ) return
        props.updateAttributes({ data: value })
    }, [isEditable, isNormalizing, props.node.attrs.data, props.updateAttributes, value])

    // Click outside to exit edit mode
    useEffect(() => {
        if (!isEditing) return
        const handleClickOutside = (e: MouseEvent) => {
            if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
                setIsEditing(false)
            }
        }
        // Delay listener to avoid immediate trigger from the click that opened edit mode
        const timer = setTimeout(() => {
            document.addEventListener('mousedown', handleClickOutside)
        }, 100)
        return () => {
            clearTimeout(timer)
            document.removeEventListener('mousedown', handleClickOutside)
        }
    }, [isEditing])

    // Stop ProseMirror from intercepting events on interactive controls
    const stopPmEvents = {
        onMouseDown: (e: React.MouseEvent) => e.stopPropagation(),
        onClick: (e: React.MouseEvent) => e.stopPropagation(),
        onKeyDown: (e: React.KeyboardEvent) => e.stopPropagation(),
        onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
    }

    const handleZoomIn = useCallback(() => {
        setZoom(prev => Math.min(prev + ZOOM_STEP, MAX_ZOOM))
    }, [])

    const handleZoomOut = useCallback(() => {
        setZoom(prev => Math.max(prev - ZOOM_STEP, MIN_ZOOM))
    }, [])

    const handleZoomReset = useCallback(() => {
        setZoom(1)
    }, [])

    const handleCopyCode = useCallback(() => {
        navigator.clipboard.writeText(code ?? "")
    }, [code])

    const handleDownload = useCallback(() => {
        handleDownloadSvg(diagramRef)
    }, [])

    const handleOpenFullscreen = useCallback(() => {
        setIsFullscreen(true)
    }, [])

    const handleCloseFullscreen = useCallback(() => {
        setIsFullscreen(false)
    }, [])

    // Escape to close fullscreen
    useEffect(() => {
        if (!isFullscreen) return
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") setIsFullscreen(false)
        }
        document.addEventListener("keydown", handleKeyDown)
        return () => document.removeEventListener("keydown", handleKeyDown)
    }, [isFullscreen])

    // Ctrl/Cmd + wheel zoom on preview area
    useEffect(() => {
        const container = previewRef.current
        if (!container) return
        const handleWheel = (e: WheelEvent) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault()
                setZoom(prev => {
                    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP
                    const next = prev + delta
                    return Math.min(Math.max(next, MIN_ZOOM), MAX_ZOOM)
                })
            }
        }
        container.addEventListener('wheel', handleWheel, { passive: false })
        return () => container.removeEventListener('wheel', handleWheel)
    }, [isEditing])

    const mermaidConfig = useMemo(() => ({
        theme: isDark ? "dark" : "default" as any,
        themeVariables: {
            primaryColor: '#3b82f6',
            secondaryColor: '#60a5fa',
            tertiaryColor: '#93c5fd',
            fontFamily: 'Inter, sans-serif',
            fontSize: '16px',
        },
        securityLevel: 'loose' as const,
    }), [isDark])

    const renderToolbar = () => (
        <div className="absolute bottom-2 right-2 flex items-center gap-1 z-10"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
        >
            <div className="mermaid-preview-zoom-controls flex items-center gap-1 bg-gray-100/80 dark:bg-gray-700/80 backdrop-blur-sm rounded-lg p-0.5">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleZoomOut}
                    disabled={zoom <= MIN_ZOOM}
                    className="h-6 w-6 p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600"
                    title="Zoom out"
                >
                    <ZoomOut className="h-3.5 w-3.5" />
                </Button>
                <span className="text-[10px] font-medium text-gray-600 dark:text-gray-300 min-w-[2.5rem] text-center select-none">
                    {Math.round(zoom * 100)}%
                </span>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleZoomIn}
                    disabled={zoom >= MAX_ZOOM}
                    className="h-6 w-6 p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600"
                    title="Zoom in"
                >
                    <ZoomIn className="h-3.5 w-3.5" />
                </Button>
                <div className="w-px h-3 bg-gray-300 dark:bg-gray-500 mx-0.5" />
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleZoomReset}
                    className="h-6 w-6 p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600"
                    title="Reset zoom"
                >
                    <RotateCcw className="h-3 w-3" />
                </Button>
                <div className="w-px h-3 bg-gray-300 dark:bg-gray-500 mx-0.5" />
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleCopyCode}
                    className="h-6 w-6 p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600"
                    title="Copy code"
                >
                    <CopyIcon className="h-3.5 w-3.5" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleDownload}
                    className="h-6 w-6 p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600"
                    title="Download SVG"
                >
                    <DownloadIcon className="h-3.5 w-3.5" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleOpenFullscreen}
                    className="h-6 w-6 p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600"
                    title="View fullscreen"
                >
                    <Maximize2 className="h-3.5 w-3.5" />
                </Button>
            </div>
            <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 p-1 hover:bg-gray-200 dark:hover:bg-gray-600"
                onClick={() => {
                    window.open("https://mermaid.js.org/intro/", "_blank")
                }}
                title="Mermaid syntax help"
            >
                <HelpCircle className="h-3.5 w-3.5" />
            </Button>
        </div>
    )

    const renderPreview = () => {
        if (!code) {
            return (
                <EmptyState
                    className="w-full hover:bg-accent/10 border-none rounded-md cursor-pointer"
                    title={t('mermaid.title')}
                    description={t('mermaid.editDescription')}
                    icons={[GitBranch, ArrowRightLeft, Network]}
                    action={{
                        label: t('mermaid.learnSyntax'),
                        onClick: () => {
                            window.open("https://mermaid.js.org/intro/", "_blank")
                        }
                    }}
                />
            )
        }
        return (
            <RenderMermaid
                mermaidCode={code}
                mermaidConfig={mermaidConfig}
                disableCopy
                disableDownload
                disableFullscreen
                errorComponent={(error) => <div className="text-red-500 p-4">{error.error}</div>}
            />
        )
    }

    // --- Editing mode: split layout with code editor + preview ---
    if (isEditing && isEditable) {
        return (
            <NodeViewWrapper className="h-auto">
                <Card
                    ref={cardRef}
                    className="overflow-hidden"
                    contentEditable={false}
                    suppressContentEditableWarning
                    {...stopPmEvents}
                >
                    {/* Done button bar */}
                    <div className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/30">
                        <span className="text-xs font-medium text-muted-foreground">Mermaid</span>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 gap-1 text-xs"
                            onClick={() => setIsEditing(false)}
                        >
                            <Check className="h-3.5 w-3.5" />
                            {t('common.done') || 'Done'}
                        </Button>
                    </div>
                    <div className="flex gap-0 min-h-[400px]">
                        {/* Left Panel: Code Editor */}
                        <div className="w-1/2 border-r min-w-0 flex flex-col">
                            <Editor
                                value={code}
                                width="100%"
                                height="100%"
                                theme={isDark ? "vs-dark" : "light"}
                                options={{
                                    minimap: { enabled: false },
                                    automaticLayout: true,
                                    fontSize: 14,
                                    scrollBeyondLastLine: false,
                                    wordWrap: 'on',
                                }}
                                onMount={(editor, monaco) => {
                                    editorRef.current = monaco
                                }}
                                onChange={(value) => {
                                    const nextCode = value || ''
                                    normalizationVersionRef.current += 1
                                    setIsNormalizing(false)
                                    codeRef.current = nextCode
                                    setCode(nextCode)
                                }}
                            />
                        </div>

                        {/* Right Panel: Mermaid Preview */}
                        <div ref={previewRef} className="w-1/2 relative overflow-hidden">
                            <div
                                className="w-full h-full overflow-auto p-2"
                                onPointerDown={(e) => e.stopPropagation()}
                            >
                                <div
                                    ref={diagramRef}
                                    className="mermaid-preview-zoomable flex items-center justify-center min-h-full origin-top transition-transform duration-150"
                                    style={{ transform: `scale(${zoom})` }}
                                >
                                    {renderPreview()}
                                </div>
                            </div>
                            {/* Toolbar: zoom + copy/download/fullscreen */}
                            {code && renderToolbar()}
                            {!code && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="absolute bottom-2 right-2 h-8 w-8"
                                    onClick={() => {
                                        window.open("https://mermaid.js.org/intro/", "_blank")
                                    }}
                                >
                                    <HelpCircle className="h-4 w-4" />
                                </Button>
                            )}
                        </div>
                    </div>
                </Card>
            </NodeViewWrapper>
        )
    }

    // --- Compact view: rendered diagram only (click to edit) ---
    return (
        <NodeViewWrapper className="h-auto">
            <Card
                ref={cardRef}
                className="overflow-hidden group cursor-pointer transition-shadow hover:shadow-md"
                contentEditable={false}
                suppressContentEditableWarning
                onDoubleClick={() => isEditable && setIsEditing(true)}
            >
                <CardContent className="p-2 relative" ref={previewRef}>
                    <div
                        className="w-full overflow-auto"
                        onPointerDown={(e) => e.stopPropagation()}
                    >
                        <div
                            ref={diagramRef}
                            className="mermaid-preview-zoomable flex items-center justify-center origin-top transition-transform duration-150"
                            style={{ transform: `scale(${zoom})` }}
                        >
                            {renderPreview()}
                        </div>
                    </div>
                    {/* Always-visible Edit button in top-right */}
                    {isEditable && code && (
                        <Button
                            variant="secondary"
                            size="sm"
                            className="absolute top-2 right-2 z-20 h-7 px-2 gap-1 text-xs shadow-sm"
                            onClick={(e) => { e.stopPropagation(); setIsEditing(true) }}
                            onMouseDown={(e) => e.stopPropagation()}
                            onPointerDown={(e) => e.stopPropagation()}
                        >
                            <Pencil className="h-3 w-3" />
                            {t('common.edit') || 'Edit'}
                        </Button>
                    )}
                    {/* Toolbar: zoom + copy/download/fullscreen (hover) */}
                    {code && (
                        <div className="absolute bottom-2 right-2 flex items-center gap-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                            onPointerDown={(e) => e.stopPropagation()}
                        >
                            <div className="mermaid-preview-zoom-controls flex items-center gap-1 bg-gray-100/80 dark:bg-gray-700/80 backdrop-blur-sm rounded-lg p-0.5">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={handleZoomOut}
                                    disabled={zoom <= MIN_ZOOM}
                                    className="h-6 w-6 p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600"
                                    title="Zoom out"
                                >
                                    <ZoomOut className="h-3.5 w-3.5" />
                                </Button>
                                <span className="text-[10px] font-medium text-gray-600 dark:text-gray-300 min-w-[2.5rem] text-center select-none">
                                    {Math.round(zoom * 100)}%
                                </span>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={handleZoomIn}
                                    disabled={zoom >= MAX_ZOOM}
                                    className="h-6 w-6 p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600"
                                    title="Zoom in"
                                >
                                    <ZoomIn className="h-3.5 w-3.5" />
                                </Button>
                                <div className="w-px h-3 bg-gray-300 dark:bg-gray-500 mx-0.5" />
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={handleCopyCode}
                                    className="h-6 w-6 p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600"
                                    title="Copy code"
                                >
                                    <CopyIcon className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={handleDownload}
                                    className="h-6 w-6 p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600"
                                    title="Download SVG"
                                >
                                    <DownloadIcon className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={handleOpenFullscreen}
                                    className="h-6 w-6 p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600"
                                    title="View fullscreen"
                                >
                                    <Maximize2 className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        </div>
                    )}
                    {/* Empty state: click anywhere to edit */}
                    {!code && isEditable && (
                        <div
                            className="absolute inset-0 cursor-pointer"
                            onClick={() => setIsEditing(true)}
                        />
                    )}
                </CardContent>
            </Card>
            {/* Fullscreen overlay */}
            {isFullscreen && (
                <div
                    className="fixed inset-0 z-[9999] bg-black/75 flex items-center justify-center animate-[mermaid-fade-in_0.2s_ease]"
                    onClick={(e) => { if (e.target === e.currentTarget) handleCloseFullscreen() }}
                >
                    <div className="relative max-w-[95vw] max-h-[95vh] overflow-auto bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-8">
                        <button
                            className="absolute top-3 right-3 z-[1] w-8 h-8 border-none rounded-lg bg-gray-100 text-gray-700 text-base cursor-pointer flex items-center justify-center transition-colors duration-150 hover:bg-gray-200 hover:text-gray-900 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 dark:hover:text-gray-100"
                            onClick={handleCloseFullscreen}
                            aria-label="Close"
                        >
                            ✕
                        </button>
                        <div
                            className="flex justify-center items-center [&>svg]:max-w-[90vw] [&>svg]:max-h-[85vh] [&>svg]:w-auto [&>svg]:h-auto"
                            dangerouslySetInnerHTML={{
                                __html: diagramRef.current?.innerHTML || ""
                            }}
                        />
                    </div>
                </div>
            )}
        </NodeViewWrapper>
    )
}