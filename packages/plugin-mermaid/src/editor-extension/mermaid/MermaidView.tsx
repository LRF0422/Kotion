import { NodeViewProps, NodeViewWrapper } from "@kn/editor"
import React, { useEffect, useRef, useState } from "react"
import mermaid from 'mermaid'
import { useAsyncEffect, useDebounce } from "@kn/core"
import { EmptyState, Button, useTheme } from "@kn/ui"
import Editor, { Monaco } from '@monaco-editor/react';
import { HelpCircle, BoxIcon } from "@kn/icon"
import RenderMermaid from "../../component"

export const MermaidView: React.FC<NodeViewProps> = (props) => {

    const editorRef = useRef<Monaco>();
    const { theme } = useTheme()
    const [needFresh, setNeedFresh] = useState(0)
    const container = useRef<HTMLDivElement>(null)
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

    return <NodeViewWrapper className="h-auto">
        <div className="flex gap-2 p-2">
            {props.editor.isEditable && <div className="w-1/2">
                <Editor
                    defaultValue={code}
                    width="100%"
                    height="300px"
                    theme={theme === "dark" ? "vs-dark" : "light"}
                    className="rounded-md border"
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
            </div>}
            <div className={`${props.editor.isEditable ? 'w-1/2' : 'w-full'} flex flex-col border rounded-md items-center justify-center p-2 relative`}>
                <div className="w-full h-full flex items-center justify-center">
                    {
                        code ? <RenderMermaid
                            mermaidCode={code}
                            mermaidConfig={{
                                theme: theme === "dark" ? "dark" : "default",
                                themeVariables: theme === "dark" ? {
                                    primaryColor: '#3b82f6',
                                    secondaryColor: '#60a5fa',
                                    tertiaryColor: '#93c5fd',
                                    fontFamily: 'Inter, sans-serif',
                                    fontSize: '16px',
                                } : {
                                    primaryColor: '#3b82f6',
                                    secondaryColor: '#60a5fa',
                                    tertiaryColor: '#93c5fd',
                                    fontFamily: 'Inter, sans-serif',
                                    fontSize: '16px',
                                }, // Consistent theme variables for both light and dark modes
                                securityLevel: 'loose',
                            }}
                            errorComponent={(error) => <div className="text-red-500 p-4">{error.error}</div>}
                        /> : <EmptyState
                            className="h-full w-full hover:bg-accent/10 border-none rounded-md"
                            title="Mermaid Diagram"
                            description="Enter Mermaid code to visualize your diagram"
                            icons={[BoxIcon]}
                            action={{
                                label: "Learn Mermaid Syntax",
                                onClick: () => {
                                    window.open("https://mermaid.js.org/intro/", "_blank")
                                }
                            }}
                        />
                    }
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
    </NodeViewWrapper>
}