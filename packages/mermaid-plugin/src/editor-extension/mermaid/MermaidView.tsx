import { NodeViewContent, NodeViewProps, NodeViewWrapper } from "@repo/editor"
import React, { useEffect, useRef } from "react"
import mermaid from 'mermaid'
import { useDebounce } from "@repo/core"


export const MermaidView: React.FC<NodeViewProps> = (props) => {

    const ref = useRef<HTMLPreElement>(null)
    const previewRef = useRef<HTMLPreElement>(null)
    const value = useDebounce(ref.current?.innerText, { wait: 500 })

    useEffect(() => {
        mermaid.initialize({ startOnLoad: true })
    }, [])

    useEffect(() => {
        console.log('value', value);
        if (value && previewRef.current) {
            mermaid.render("mermaid", value, previewRef.current)
        }
    }, [value])

    return <NodeViewWrapper>
        <div className="flex w-full h-[500px] gap-1">
            <div className=" w-[300px] h-full">
                <pre ref={ref} className="prose-pre:bg-slate-600">
                    <NodeViewContent as="code" className=" leading-none" />
                </pre>
            </div>
            <pre ref={previewRef} className="mermaid flex-1" id="mermaid" contentEditable={false}>
            </pre>
        </div>
    </NodeViewWrapper>
}