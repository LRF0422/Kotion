import React, { useCallback } from "react"
import { NodeViewProps, NodeViewWrapper } from "@kn/editor"
import { FileManagerView } from "../component/FileManager"
import { useModal } from "@kn/common"
import { EmptyState } from "@kn/ui"
import { FolderOpenIcon } from "@kn/icon"
import { ViewMode } from "../component/FileContext"
import { useI18n } from "../../i18n/use-i18n"

export const FolderView: React.FC<NodeViewProps> = (props) => {
    const { t } = useI18n()

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
            title: t('folderView.selectFolder')
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
                    title={t('folderView.noFolderSelected')}
                    className="w-full max-w-none"
                    description={t('folderView.selectFolderDescription')}
                    icons={[FolderOpenIcon]}
                    action={editor.isEditable ? {
                        label: t('folderView.selectFolder'),
                        onClick: () => open()
                    } : undefined}
                />
        }
    </NodeViewWrapper>
}