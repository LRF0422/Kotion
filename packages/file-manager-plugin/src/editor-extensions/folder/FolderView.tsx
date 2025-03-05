import React, { useEffect } from "react"
import { NodeViewProps, NodeViewWrapper } from "@repo/editor"
import { FileManagerView } from "../component/FileManager"
import { useModal } from "@repo/core"

export const FolderView: React.FC<NodeViewProps> = (props) => {

    const { node: { attrs } } = props

    const { openModal, closeModal } = useModal()

    useEffect(() => {
        if (!attrs.folderId) {
            openModal({
                simple: true,
                width: 1000,
                content: <FileManagerView
                    className=" h-full"
                    selectable
                    onCancel={closeModal}
                />,
                title: 'Select a folder'
            })
        }
    }, [])

    return <NodeViewWrapper as="div" className=" rounded-sm w-full">
        {
            attrs.folderId ? <FileManagerView folderId={attrs.folderId} /> :
                <div className="p-2">
                    {attrs.folderId}
                </div>
        }
    </NodeViewWrapper>
}