import { NodeViewProps, NodeViewWrapper } from "@kn/editor"
import React, { useEffect, useRef, useState } from "react"
import mermaid from 'mermaid'
import { useAsyncEffect, useDebounce, useTheme } from "@kn/core"
import { CodeEditor, EmptyState, IconButton } from "@kn/ui"
import { AiOutlineQuestionCircle, BoxIcon } from "@kn/icon"
export const MermaidView: React.FC<NodeViewProps> = (props) => {

    const divRef = useRef<HTMLDivElement>(null)
    const [svg, setSvg] = useState<string>()
    const [code, setCode] = useState<string>(props.node.attrs.data || "")
    const value = useDebounce(code, { wait: 500 })
    const { theme } = useTheme()

    useEffect(() => {
        mermaid.initialize({ startOnLoad: false, theme: theme === "dark" ? "dark" : "default", suppressErrorRendering: false })
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
    }, [value, theme])

    return <NodeViewWrapper className="h-auto">
        <div className=" hidden" ref={divRef}></div>
        <div className="flex gap-1">
            {props.editor.isEditable && <CodeEditor
                editable={props.editor.isEditable}
                value={code}
                height="300px"
                width="400px"
                className="rounded-sm"
                onChange={setCode}
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