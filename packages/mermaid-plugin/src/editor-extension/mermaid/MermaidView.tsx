import { NodeViewContent, NodeViewProps, NodeViewWrapper } from "@repo/editor"
import React, { useEffect, useRef, useState } from "react"
import mermaid from 'mermaid'
import { useAsyncEffect, useDebounce, useTheme } from "@repo/core"
import { Textarea } from "@repo/ui"
export const MermaidView: React.FC<NodeViewProps> = (props) => {

    const ref = useRef<HTMLPreElement>(null)
    const divRef = useRef<HTMLDivElement>(null)
    const [svg, setSvg] = useState<string>()
    const value = useDebounce(ref.current?.innerText, { wait: 500 })
    const { theme } = useTheme()

    useEffect(() => {
        mermaid.initialize({ startOnLoad: false, theme: theme === "dark" ? "dark" : "default", suppressErrorRendering: false })
    }, [])

    useAsyncEffect(async () => {
        if (value && value.trim()) {
            const res = await mermaid.render("preview111", value)
            setSvg(btoa(res.svg))
        }
    }, [value, ref])

    return <NodeViewWrapper className="h-auto">
        <div className=" hidden" ref={divRef}></div>
        <div className="flex gap-1">
            <pre ref={ref} className="w-[300px]">
                <NodeViewContent className="leading-none" />
            </pre>
            <div className="flex-1 border rounded-sm">
                {svg && <img src={`data:image/svg+xml;base64,${svg}`} width="100%" />}
            </div>
        </div>

    </NodeViewWrapper>
}