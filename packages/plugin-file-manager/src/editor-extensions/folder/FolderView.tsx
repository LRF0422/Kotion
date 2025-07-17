import React, { useEffect } from "react"
import { NodeViewProps, NodeViewWrapper } from "@repo/editor"
import { FileManagerView } from "../component/FileManager"
import { useModal } from "@repo/core"
import { Button, EmptyState } from "@repo/ui"
import { FolderOpenIcon } from "@repo/icon"

export const FolderView: React.FC<NodeViewProps> = (props) => {

    const { node: { attrs }, editor } = props

    const { openModal, closeModal } = useModal()

    const open = () => {
        openModal({
            simple: true,
            width: 1000,
            content: <FileManagerView
                className=" h-full"
                selectable
                onCancel={closeModal}
                onConfirm={(value) => {
                    if (value) {
                        props.updateAttributes({
                            folderId: value[0].id
                        })
                    }
                }}
            />,
            title: 'Select a folder'
        })
    }

    return <NodeViewWrapper as="div" className=" rounded-sm w-full">
        {
            attrs.folderId ?
                <FileManagerView
                    folderId={attrs.folderId}
                    className=" h-[500px]"
                /> : <EmptyState
                    title="No folder selected"
                    className="w-full max-w-none"
                    description="Select a folder to view its contents"
                    icons={[FolderOpenIcon]}
                    action={editor.isEditable ? {
                        label: 'Select a folder',
                        onClick: () => open()
                    } : undefined}
                />
        }
    </NodeViewWrapper>
}