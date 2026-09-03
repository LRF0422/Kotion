import React, { useCallback, useState } from "react"
import { NodeViewProps, NodeViewWrapper } from "@kn/editor"
import { FileManagerView } from "../component/FileManager"
import { FolderOpenIcon } from "@kn/icon"
import { ViewMode } from "../component/FileContext"
import { useI18n } from "../../i18n/use-i18n"
import { FileManagerDialogShell } from "../component/FileManagerDialogShell"
import { FileManagerEmptyState } from "../component/FileManagerEmptyState"

export const FolderView: React.FC<NodeViewProps> = (props) => {
    const { t } = useI18n()

    const { node: { attrs }, editor, updateAttributes } = props

    const [selectorOpen, setSelectorOpen] = useState(false)

    const handleViewModeChange = useCallback((mode: ViewMode) => {
        updateAttributes({ viewMode: mode })
    }, [updateAttributes])

    const handleOpenSelector = useCallback(() => {
        setSelectorOpen(true)
    }, [])

    const handleConfirm = useCallback((files: any[]) => {
        if (files?.length === 1 && files[0].isFolder) {
            updateAttributes({ folderId: String(files[0].id) })
        }
        setSelectorOpen(false)
    }, [updateAttributes])

    const handleCancel = useCallback(() => {
        setSelectorOpen(false)
    }, [])

    return (
        <NodeViewWrapper
            as="div"
            className="not-prose my-2 h-[clamp(320px,60dvh,500px)] w-full rounded-xl"
        >
            {attrs.folderId ? (
                <FileManagerView
                    folderId={attrs.folderId}
                    className="h-full"
                    defaultViewMode={attrs.viewMode as ViewMode}
                    onViewModeChange={handleViewModeChange}
                    showSidebar={false}
                />
            ) : (
                <FileManagerEmptyState
                    icon={FolderOpenIcon}
                    title={t('folderView.noFolderSelected')}
                    description={t('folderView.selectFolderDescription')}
                    className="h-full rounded-xl"
                    action={editor.isEditable ? {
                        label: t('folderView.selectFolder'),
                        onClick: handleOpenSelector,
                    } : undefined}
                />
            )}

            <FileManagerDialogShell
                open={selectorOpen}
                onOpenChange={setSelectorOpen}
                title={t('folderView.selectFolder')}
                description={t('folderView.selectFolderDescription')}
                contentClassName="md:max-w-4xl"
            >
                <FileManagerView
                    className="h-full border-0 rounded-none"
                    selectable
                    multiple={false}
                    target="folder"
                    onCancel={handleCancel}
                    onConfirm={handleConfirm}
                />
            </FileManagerDialogShell>
        </NodeViewWrapper>
    )
}