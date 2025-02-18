import React from "react"
import { NodeViewProps, NodeViewWrapper } from "@repo/editor"

export const FolderView: React.FC<NodeViewProps> = (props) => {

    const { node: { attrs } } = props

    return <NodeViewWrapper as="div" className=" border rounded-sm w-full h-[300px]">
        <div></div>
    </NodeViewWrapper>
}