import { NodeViewProps, NodeViewWrapper } from "@kn/editor"
import React, { useEffect, useRef, useState } from "react"
import { useDebounce, useTranslation } from "@kn/common"
import { EmptyState, Button, Card, CardContent, useTheme } from "@kn/ui"
import Editor, { Monaco } from '@monaco-editor/react';
import { HelpCircle, GitBranch, ArrowRightLeft, Network } from "@kn/icon"
import RenderMermaid from "../../component"

export const MermaidView: React.FC<NodeViewProps> = (props) => {

    const editorRef = useRef<Monaco>();
    const { theme } = useTheme()
    const { t } = useTranslation()
    const isEditable = props.editor.isEditable
    const isDark = theme === 'dark'
    const [code, setCode] = useState(props.node.attrs.data)
    const value = useDebounce(code, {
        wait: 500,
    })

    useEffect(() => {
        props.updateAttributes({
            ...props.node.attrs,
            data: value
        })
    }, [value])

    // Stop ProseMirror from intercepting events on interactive controls
    const stopPmEvents = {
        onMouseDown: (e: React.MouseEvent) => e.stopPropagation(),
        onClick: (e: React.MouseEvent) => e.stopPropagation(),
        onKeyDown: (e: React.KeyboardEvent) => e.stopPropagation(),
        onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
    }

    const mermaidConfig = {
        theme: isDark ? "dark" : "default" as const,
        themeVariables: {
            primaryColor: '#3b82f6',
            secondaryColor: '#60a5fa',
            tertiaryColor: '#93c5fd',
            fontFamily: 'Inter, sans-serif',
            fontSize: '16px',
        },
        securityLevel: 'loose' as const,
    }

    const renderPreview = () => {
        if (!code) {
            return (
                <EmptyState
                    className="w-full hover:bg-accent/10 border-none rounded-md"
                    title={t('mermaid.title')}
                    description={isEditable
                        ? t('mermaid.editDescription')
                        : t('mermaid.viewDescription')
                    }
                    icons={[GitBranch, ArrowRightLeft, Network]}
                    action={isEditable ? {
                        label: t('mermaid.learnSyntax'),
                        onClick: () => {
                            window.open("https://mermaid.js.org/intro/", "_blank")
                        }
                    } : undefined}
                />
            )
        }
        return (
            <RenderMermaid
                mermaidCode={code}
                mermaidConfig={mermaidConfig}
                errorComponent={(error) => <div className="text-red-500 p-4">{error.error}</div>}
            />
        )
    }

    // --- Edit mode: split layout ---
    if (isEditable) {
        return (
            <NodeViewWrapper className="h-auto">
                <Card
                    className="overflow-hidden"
                    contentEditable={false}
                    suppressContentEditableWarning
                    {...stopPmEvents}
                >
                    <div className="flex gap-0 min-h-[400px]">
                        {/* Left Panel: Code Editor */}
                        <div className="w-1/2 border-r min-w-0 flex flex-col">
                            <Editor
                                defaultValue={code}
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
                                    setCode(value || '')
                                }}
                            />
                        </div>

                        {/* Right Panel: Mermaid Preview */}
                        <div className="w-1/2 p-2 flex flex-col items-center justify-center relative">
                            <div className="w-full h-full flex items-center justify-center">
                                {renderPreview()}
                            </div>
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
                        </div>
                    </div>
                </Card>
            </NodeViewWrapper>
        )
    }

    // --- View mode: full-width mermaid ---
    return (
        <NodeViewWrapper className="h-auto">
            <Card className="overflow-hidden">
                <CardContent className="p-2">
                    <div className="w-full flex items-center justify-center">
                        {renderPreview()}
                    </div>
                </CardContent>
            </Card>
        </NodeViewWrapper>
    )
}