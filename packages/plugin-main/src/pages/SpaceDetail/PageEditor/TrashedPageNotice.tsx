import React from 'react'
import { useTranslation } from '@kn/common'
import { ArrowLeft, Trash2, Undo2 } from '@kn/icon'
import { Button } from '@kn/ui'

interface TrashedPageNoticeProps {
    /** Title of the page that is in the trash, when it is known. */
    pageTitle?: string
    /** True while the restore request is in flight. */
    restoring?: boolean
    onRestore: () => void
    onBack: () => void
}

/**
 * Rendered instead of the editor when the page behind the URL lives in the
 * trash. Trashed pages used to open normally from a stale "Recent" entry (the
 * read API does not police status), which made deletion look like a no-op.
 * Restoring from here is the only way back to editing, mirroring the trash
 * dropdown action.
 */
export const TrashedPageNotice: React.FC<TrashedPageNoticeProps> = ({
    pageTitle,
    restoring = false,
    onRestore,
    onBack,
}) => {
    const { t } = useTranslation()

    return (
        <div className="flex h-full items-center justify-center p-6">
            <div className="flex max-w-md flex-col items-center gap-4 rounded-xl border bg-card p-8 text-center shadow-sm">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <Trash2 className="h-6 w-6" />
                </span>
                <div className="min-w-0">
                    <h2 className="font-semibold">{t('editor.trash.title', 'This page is in the trash')}</h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                        {t('editor.trash.description', 'Restore it to open and edit it again.')}
                    </p>
                    {pageTitle ? (
                        <p className="mt-2 truncate text-sm font-medium" title={pageTitle}>{pageTitle}</p>
                    ) : null}
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" className="gap-2" onClick={onBack}>
                        <ArrowLeft className="h-4 w-4" />
                        {t('editor.trash.back', 'Back to space')}
                    </Button>
                    <Button className="gap-2" onClick={onRestore} disabled={restoring}>
                        <Undo2 className="h-4 w-4" />
                        {restoring
                            ? t('editor.trash.restoring', 'Restoring…')
                            : t('editor.trash.restore', 'Restore page')}
                    </Button>
                </div>
            </div>
        </div>
    )
}
