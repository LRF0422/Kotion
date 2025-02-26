import React from "react"
import { NodeViewProps, NodeViewWrapper } from "@repo/editor"
import { FileManager } from "../component/FileManager"

export const FolderView: React.FC<NodeViewProps> = (props) => {

    const { node: { attrs } } = props

    return <NodeViewWrapper as="div" className=" rounded-sm w-full">
        <FileManager folderId="111" />
    </NodeViewWrapper>
}