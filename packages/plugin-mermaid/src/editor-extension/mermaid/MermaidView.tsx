import { NodeViewProps, NodeViewWrapper } from "@kn/editor"
import React, { useEffect, useRef, useState } from "react"
import mermaid from 'mermaid'
import { useAsyncEffect, useDebounce } from "@kn/core"
import { EmptyState, IconButton, useTheme } from "@kn/ui"
import Editor, { Monaco } from '@monaco-editor/react';
import { AiOutlineQuestionCircle, BoxIcon } from "@kn/icon"
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
        <div className="flex gap-1 p-1">
            {props.editor.isEditable && <Editor
                defaultValue={code}
                width="400px"
                height="auto"
                theme={theme === "dark" ? "vs-dark" : "light"}
                className="rounded-sm min-h-[300px]"
                options={{
                    minimap: { enabled: false }
                }}
                onMount={(editor, monaco) => {
                    editorRef.current = monaco
                }}
                onChange={(value) => {
                    setCode(value)
                }}
            />}
            <div className="flex-1 flex border rounded-sm items-center justify-center p-1 relative">
                {
                    code ? <>
                        <RenderMermaid mermaidCode={code}
                            mermaidConfig={{
                                theme: theme === "dark" ? "dark" : "default",
                            }}
                            errorComponent={(error) => <div className="text-red-500">{error.error}</div>} />
                        <IconButton icon={<AiOutlineQuestionCircle className="h-5 w-5" />} className=" absolute bottom-1 right-1" />
                    </> : <EmptyState
                        className="h-full w-full hover:bg-background border-none max-w-none"
                        title="Mermaid"
                        description="No code provided"
                        icons={[BoxIcon]}
                        action={{
                            label: "How to create mermaid ? ",
                            onClick: () => {
                                window.open("https://mermaid.js.org/intro/", "_blank")
                            }
                        }}
                    />
                }
            </div>
        </div>
    </NodeViewWrapper>
}