import React, { useEffect } from "react"
import { NodeViewProps, NodeViewWrapper } from "@repo/editor"
import { FileManagerView } from "../component/FileManager"
import { useModal } from "@repo/core"

export const FolderView: React.FC<NodeViewProps> = (props) => {

    const { node: { attrs } } = props

    const { openModal } = useModal()

    useEffect(() => {
        openModal({
            simple: true,
            content: <FileManagerView className=" h-full" />,
            title: 'Select a folder'
        })
    }, [])

    return <NodeViewWrapper as="div" className=" rounded-sm w-full">
    </NodeViewWrapper>
}