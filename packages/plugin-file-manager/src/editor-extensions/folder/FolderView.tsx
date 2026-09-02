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
import { FileIcon, FileTextIcon, FolderOpenIcon } from "@kn/icon"
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
        <NodeViewWrapper
            as="div"
            className={attrs.folderId
                ? "not-prose my-2 w-full rounded-lg"
                : "not-prose w-full rounded-xl"
            }
        >
            {attrs.folderId ? (
                <FileManagerView
                    folderId={attrs.folderId}
                    className="h-[500px]"
                    defaultViewMode={attrs.viewMode as ViewMode}
                    onViewModeChange={handleViewModeChange}
                    showSidebar={false}
                />
            ) : (
                <EmptyState
                    title={t('folderView.noFolderSelected')}
                    className="flex min-h-[220px] w-full max-w-none flex-col items-center justify-center rounded-xl border border-dashed border-border/60 bg-card/50 p-6 transition-all duration-200 hover:border-border hover:bg-muted/20 hover:shadow-sm sm:min-h-[250px] sm:p-10 [&>div:first-child>div]:bg-background/90 [&>div:first-child>div]:shadow-sm [&>div:first-child>div]:ring-border/70 [&>h2]:mt-5 [&>h2]:text-[15px] [&>h2]:font-semibold [&>h2]:leading-6 [&>p]:mx-auto [&>p]:mt-1.5 [&>p]:max-w-md [&>p]:text-[13px] [&>p]:leading-5 [&>button]:mt-5 [&>button]:h-11 [&>button]:rounded-lg [&>button]:bg-background/80 [&>button]:px-5 sm:[&>button]:h-10"
                    description={t('folderView.selectFolderDescription')}
                    icons={[FileIcon, FolderOpenIcon, FileTextIcon]}
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