import { NodeViewProps, NodeViewWrapper } from "@kn/editor"
import React, { useEffect, useRef, useState } from "react"
import mermaid from 'mermaid'
import { useAsyncEffect, useDebounce } from "@kn/core"
import { EmptyState, IconButton, useTheme } from "@kn/ui"
import Editor,{ Monaco} from '@monaco-editor/react';
import { AiOutlineQuestionCircle, BoxIcon } from "@kn/icon"
export const MermaidView: React.FC<NodeViewProps> = (props) => {

    const [svg, setSvg] = useState<string>()
    const [code, setCode] = useState<string | undefined >(props.node.attrs.data || "")
    const value = useDebounce(code, { wait: 500 })
    const editorRef = useRef<Monaco>();
    const { theme } = useTheme()
    const [needFresh, setNeedFresh] = useState(0)

    useEffect(() => {
        mermaid.initialize({ startOnLoad: false, theme: theme === "dark" ? "dark" : "default", suppressErrorRendering: false })
        setNeedFresh(needFresh + 1)
    }, [theme])

    useAsyncEffect(async () => {
        if (value && value.trim()) {
            if (await mermaid.parse(value)) {
                const res = await mermaid.render("preview111", value)
                setSvg(btoa(res.svg))
                props.updateAttributes({
                    ...props.node.attrs,
                    data: value
                })
            }
        }
    }, [value, theme, needFresh])

    return <NodeViewWrapper className="h-auto">
        <div className="flex gap-1 p-1">
            {props.editor.isEditable && <Editor
                defaultValue={code}
                width="400px"
                theme={theme === "dark" ? "vs-dark" : "light"}
                height="300px"
                className="rounded-sm"
                options={{
                    minimap: { enabled: false }
                }}
                onMount={(editor, monaco) => {
                  editorRef.current = monaco
                }}
                onChange={(value) => {
                    console.log('changed');
                    setCode(value)
                }}
            />}
            <div className="flex-1 flex border rounded-sm items-center justify-center p-1 relative">
                {
                    code ? <>
                        {svg && <img src={`data:image/svg+xml;base64,${svg}`} width={props.editor.isEditable ? 300 : 500} />}
                        <IconButton icon={<AiOutlineQuestionCircle className="h-5 w-5" />} className=" absolute bottom-1 right-1" />
                    </> : <EmptyState
                        className="h-full w-full hover:bg-background border-none max-w-none"
                        title="Mermaid"
                        description="No code provided"
                        icons={[BoxIcon]}
                    />
                }
            </div>
        </div>
    </NodeViewWrapper>
}