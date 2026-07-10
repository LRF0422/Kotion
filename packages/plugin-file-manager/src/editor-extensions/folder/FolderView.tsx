import React, { useCallback, useState } from "react"
import { NodeViewProps, NodeViewWrapper } from "@kn/editor"
import { FileManagerView } from "../component/FileManager"
import {
    EmptyState,
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@kn/ui"
import { FolderOpenIcon } from "@kn/icon"
import { ViewMode } from "../component/FileContext"
import { useI18n } from "../../i18n/use-i18n"

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
        if (files && files.length > 0) {
            updateAttributes({ folderId: files[0].id })
        }
        setSelectorOpen(false)
    }, [updateAttributes])

    const handleCancel = useCallback(() => {
        setSelectorOpen(false)
    }, [])

    return (
        <NodeViewWrapper as="div" className="rounded-lg w-full my-2">
            {attrs.folderId ? (
                <FileManagerView
                    folderId={attrs.folderId}
                    className="h-[500px]"
                    defaultViewMode={attrs.viewMode as ViewMode}
                    onViewModeChange={handleViewModeChange}
                />
            ) : (
                <EmptyState
                    title={t('folderView.noFolderSelected')}
                    className="w-full max-w-none rounded-lg border-2"
                    description={t('folderView.selectFolderDescription')}
                    icons={[FolderOpenIcon]}
                    action={editor.isEditable ? {
                        label: t('folderView.selectFolder'),
                        onClick: handleOpenSelector,
                    } : undefined}
                />
            )}

            <Dialog open={selectorOpen} onOpenChange={setSelectorOpen}>
                <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-0 gap-0">
                    <DialogHeader className="px-4 py-3 border-b">
                        <DialogTitle>{t('folderView.selectFolder')}</DialogTitle>
                        <DialogDescription>
                            {t('folderView.selectFolderDescription')}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex-1 overflow-hidden">
                        <FileManagerView
                            className="h-full border-0 rounded-none"
                            selectable
                            target="folder"
                            onCancel={handleCancel}
                            onConfirm={handleConfirm}
                        />
                    </div>
                </DialogContent>
            </Dialog>
        </NodeViewWrapper>
    )
}