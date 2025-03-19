import { NodeViewContent, NodeViewProps, NodeViewWrapper } from "@repo/editor"
import React, { useEffect, useRef, useState } from "react"
import mermaid from 'mermaid'
import { useAsyncEffect, useDebounce } from "@repo/core"
import { Textarea } from "@repo/ui"

mermaid.initialize({ startOnLoad: false })
export const MermaidView: React.FC<NodeViewProps> = (props) => {

    const ref = useRef<HTMLPreElement>(null)
    const previewRef = useRef<HTMLPreElement>(null)
    const [text, setText] = useState<string>(props.node.attrs.data)
    const [svg, setSvg] = useState<string>()
    const value = useDebounce(text, { wait: 500 })

    useAsyncEffect( async() => {
        if ( value) {
            console.log('value', value);
            
            const res = await mermaid.render("preview", value)
            console.log('res', res);
            setSvg(btoa(res.svg))
            props.updateAttributes({
                data: value
            })
       }
    }, [value])

    // useEffect(() => {
    //     if (value && previewRef.current) {  
    //         mermaid.render("preview", value, previewRef?.current)
    //     }
    // }, [value])
    return <NodeViewWrapper className="h-auto">
        <div className="flex gap-1">
            {
                props.editor.isEditable && <Textarea className="w-[300px]" value={text} onChange={(e) => { setText(e.target.value) }} />
            }
            <div className="flex-1">
                { svg && <img src={`data:image/svg+xml;base64,${svg}`} width="100%" /> }
            </div>
        </div>
       
    </NodeViewWrapper>
}