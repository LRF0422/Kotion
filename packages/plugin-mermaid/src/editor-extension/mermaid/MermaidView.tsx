import { NodeViewContent, NodeViewProps, NodeViewWrapper } from "@kn/editor"
import React, { useEffect, useRef, useState } from "react"
import mermaid from 'mermaid'
import { useAsyncEffect, useDebounce, useTheme } from "@kn/core"
import { CodeEditor } from "@kn/ui"
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
    }, [value])

    return <NodeViewWrapper className="h-auto">
        <div className=" hidden" ref={divRef}></div>
        <div className="flex gap-1">
            <CodeEditor
                editable={props.editor.isEditable}
                value={code}
                height="300px"
                width="400px"
                className="rounded-sm"
                onChange={setCode}
            />
            <div className="flex-1 flex border rounded-sm max-h-[300px] items-center justify-center">
                {svg && <img src={`data:image/svg+xml;base64,${svg}`} width={300} />}
            </div>
        </div>
    </NodeViewWrapper>
}