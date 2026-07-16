import React from 'react'
import { Button } from '@kn/ui'
import { Plus, LayoutTemplate, FileUp } from '@kn/icon'
import { useTranslation } from '@kn/common'

interface QuickActionsProps {
    onCreatePage: () => void
    onOpenTemplates: () => void
    onImportDocument?: () => void
}

/**
 * Quick action buttons displayed at the top of the sidebar.
 * Provides one-click access to create page, use template, and import.
 */
export const QuickActions: React.FC<QuickActionsProps> = ({
    onCreatePage,
    onOpenTemplates,
    onImportDocument,
}) => {
    const { t } = useTranslation()

    return (
        <div className="flex items-center gap-1 px-2 py-1.5 border-b flex-shrink-0">
            <Button
                variant="ghost"
                size="sm"
                className="flex-1 h-7 text-xs gap-1.5 justify-start"
                onClick={onCreatePage}
                title={t('page.create') || 'New Page'}
            >
                <Plus className="h-3.5 w-3.5" />
                <span className="truncate">{t('page.create') || 'New Page'}</span>
            </Button>
            <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={onOpenTemplates}
                title={t('template.title') || 'From Template'}
            >
                <LayoutTemplate className="h-3.5 w-3.5" />
            </Button>
            {onImportDocument && (
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={onImportDocument}
                    title={t('import.title') || 'Import'}
                >
                    <FileUp className="h-3.5 w-3.5" />
                </Button>
            )}
        </div>
    )
}
