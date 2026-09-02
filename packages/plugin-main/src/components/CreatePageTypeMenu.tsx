import React from 'react'
import type { ResolvedPageType, SpacePageService } from '@kn/common'
import { usePageTypes, useTranslation } from '@kn/common'
import { FileText } from '@kn/icon'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@kn/ui'

export interface CreatePageByTypeOptions {
    service: SpacePageService
    spaceId: string
    parentId?: string | null
    pageType?: ResolvedPageType
    locale?: string
    translate?: (key: string, fallback: string) => string
}

export const createPageByType = async ({
    service,
    spaceId,
    parentId = '0',
    pageType,
    locale,
    translate = (_key, fallback) => fallback,
}: CreatePageByTypeOptions) => {
    const title = pageType
        ? translate(pageType.defaultTitle ?? pageType.label, pageType.defaultTitle ?? pageType.label)
        : translate('page.untitled', 'Untitled')
    const content = pageType?.renderer.type === 'editor-component'
        ? pageType.renderer.createInitialDocument({
            pageType: pageType.id,
            title,
            locale,
            spaceId,
        })
        : undefined

    return service.pages.createPage({
        spaceId,
        parentId,
        title,
        ...(pageType ? { pageType: pageType.id } : {}),
        ...(content === undefined ? {} : { content }),
    })
}

export interface CreatePageTypeMenuProps {
    children: React.ReactElement
    onCreate: (pageType?: ResolvedPageType) => void | Promise<void>
    disabled?: boolean
    align?: 'start' | 'center' | 'end'
    side?: 'top' | 'right' | 'bottom' | 'left'
}

export const CreatePageTypeMenu: React.FC<CreatePageTypeMenuProps> = ({
    children,
    onCreate,
    disabled,
    align = 'start',
    side = 'bottom',
}) => {
    const { t } = useTranslation()
    const pageTypes = usePageTypes()

    const select = (pageType?: ResolvedPageType) => {
        void onCreate(pageType)
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild disabled={disabled}>
                {children}
            </DropdownMenuTrigger>
            <DropdownMenuContent align={align} side={side} className="w-64">
                <DropdownMenuLabel>{t('page.selectType', 'Page type')}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => select()} className="gap-2">
                    <FileText className="h-4 w-4 shrink-0" />
                    <div className="min-w-0">
                        <div className="text-sm font-medium">{t('page.documentType', 'Document')}</div>
                        <div className="truncate text-xs text-muted-foreground">
                            {t('page.documentTypeDescription', 'A standard editable document')}
                        </div>
                    </div>
                </DropdownMenuItem>
                {pageTypes.map((pageType) => (
                    <DropdownMenuItem
                        key={pageType.id}
                        onClick={() => select(pageType)}
                        className="items-start gap-2"
                    >
                        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                            {pageType.icon ?? <FileText className="h-4 w-4" />}
                        </span>
                        <div className="min-w-0">
                            <div className="truncate text-sm font-medium">
                                {t(pageType.label, pageType.label)}
                            </div>
                            {pageType.description && (
                                <div className="line-clamp-2 text-xs text-muted-foreground">
                                    {t(pageType.description, pageType.description)}
                                </div>
                            )}
                        </div>
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
