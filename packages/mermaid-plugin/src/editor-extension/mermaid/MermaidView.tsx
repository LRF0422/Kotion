import { NodeViewProps, NodeViewWrapper } from "@repo/editor"
import React, { useState } from "react"
import mermaid from 'mermaid'
import { useAsyncEffect, useDebounce } from "@repo/core"
import { Textarea } from "@repo/ui"

mermaid.initialize({ startOnLoad: false })
export const MermaidView: React.FC<NodeViewProps> = (props) => {

    const [text, setText] = useState<string>(props.node.attrs.data)
    const [svg, setSvg] = useState<string>()
    const value = useDebounce(text, { wait: 500 })

    useAsyncEffect(async () => {
        if (value) {
            const res = await mermaid.render("preview", value)
            setSvg(btoa(res.svg))
            props.updateAttributes({
                data: value
            })
        }
    }, [value])

    return <NodeViewWrapper className="h-auto">
        <div className="flex gap-1">
            <Textarea className="w-[300px]" value={text} onChange={(e) => { setText(e.target.value) }} disabled={!props.editor.isEditable} />
            <div className="flex-1 border rounded-sm">
                {svg && <img src={`data:image/svg+xml;base64,${svg}`} width="100%" />}
            </div>
        </div>

    </NodeViewWrapper>
}