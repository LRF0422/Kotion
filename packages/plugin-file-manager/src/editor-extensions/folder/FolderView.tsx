import React, { useCallback } from "react"
import { NodeViewProps, NodeViewWrapper } from "@kn/editor"
import { FileManagerView } from "../component/FileManager"
import { useModal } from "@kn/core"
import { EmptyState } from "@kn/ui"
import { FolderOpenIcon } from "@kn/icon"
import { ViewMode } from "../component/FileContext"

export const FolderView: React.FC<NodeViewProps> = (props) => {

    const { node: { attrs }, editor, updateAttributes } = props

    const { openModal, closeModal } = useModal()

    const handleViewModeChange = useCallback((mode: ViewMode) => {
        updateAttributes({ viewMode: mode })
    }, [updateAttributes])

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
                        updateAttributes({
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
                    defaultViewMode={attrs.viewMode as ViewMode}
                    onViewModeChange={handleViewModeChange}
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