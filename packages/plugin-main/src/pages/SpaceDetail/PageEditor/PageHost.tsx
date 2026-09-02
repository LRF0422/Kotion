import React, { useCallback, useEffect, useState } from 'react'
import {
    hasPermission,
    type PageRecord,
    type ResolvedPageType,
    useNavigator,
    usePageTabs,
    usePageType,
    useSpacePageService,
    useTranslation,
} from '@kn/common'
import { AlertCircle, Copy, Link, Loader2, Puzzle, Star, Trash2, UserPlus } from '@kn/icon'
import { Button, Separator, toast } from '@kn/ui'
import { PageBreadcrumb } from '../../../components/PageBreadcrumb'
import { SharePanel } from '../../components/SharePanel'
import { PageEditor } from './index'

interface PageHostProps {
    pageId: string
    spaceId?: string
    active?: boolean
}

export interface PluginPageBoundaryProps {
    pageType: ResolvedPageType
    children: React.ReactNode
}

interface PluginPageBoundaryState {
    error: Error | null
    retryKey: number
}

export class PluginPageBoundary extends React.Component<PluginPageBoundaryProps, PluginPageBoundaryState> {
    state: PluginPageBoundaryState = { error: null, retryKey: 0 }

    static getDerivedStateFromError(error: Error): Partial<PluginPageBoundaryState> {
        return { error }
    }

    render() {
        if (this.state.error) {
            return (
                <div className="flex h-full items-center justify-center p-6">
                    <div className="flex max-w-lg flex-col items-center gap-4 rounded-xl border bg-card p-8 text-center shadow-sm">
                        <AlertCircle className="h-10 w-10 text-destructive" />
                        <div>
                            <h2 className="font-semibold">Plugin page failed to render</h2>
                            <p className="mt-1 text-sm text-muted-foreground">
                                {this.props.pageType.owner} · {this.props.pageType.id}
                            </p>
                        </div>
                        <p className="text-sm text-muted-foreground">{this.state.error.message}</p>
                        <Button
                            variant="outline"
                            onClick={() => this.setState((state) => ({ error: null, retryKey: state.retryKey + 1 }))}
                        >
                            Retry
                        </Button>
                    </div>
                </div>
            )
        }
        return <React.Fragment key={this.state.retryKey}>{this.props.children}</React.Fragment>
    }
}

interface ComponentPageFrameProps {
    page: PageRecord
    pageType?: ResolvedPageType
    spaceId: string
    active: boolean
    editableTitle?: boolean
    children: React.ReactNode
}

const ComponentPageFrame: React.FC<ComponentPageFrameProps> = ({
    page,
    spaceId,
    active,
    editableTitle,
    children,
}) => {
    const { t } = useTranslation()
    const service = useSpacePageService()
    const navigator = useNavigator()
    const { updateMeta } = usePageTabs(spaceId)
    const [title, setTitle] = useState(page.title)
    const [savedTitle, setSavedTitle] = useState(page.title)
    const [favorite, setFavorite] = useState(Boolean(page.favorite))
    const [savingTitle, setSavingTitle] = useState(false)

    useEffect(() => {
        setTitle(page.title)
        setSavedTitle(page.title)
        setFavorite(Boolean(page.favorite))
    }, [page.id, page.title, page.favorite])

    const saveTitle = useCallback(async () => {
        const next = title.trim() || t('page.untitled', 'Untitled')
        if (!editableTitle || next === savedTitle || savingTitle) {
            if (!next) setTitle(savedTitle)
            return
        }
        setSavingTitle(true)
        try {
            await service.pages.updatePageTitle({ pageId: page.id, title: next })
            setTitle(next)
            setSavedTitle(next)
            updateMeta(page.id, { title: next })
        } catch (error) {
            console.error('Failed to update component page title:', error)
            setTitle(savedTitle)
            toast.error(t('page.titleUpdateFailed', 'Failed to update page title'))
        } finally {
            setSavingTitle(false)
        }
    }, [editableTitle, page.id, savedTitle, savingTitle, service, t, title, updateMeta])

    const toggleFavorite = useCallback(async () => {
        const previous = favorite
        setFavorite(!previous)
        try {
            if (previous) await service.pages.unfavoritePage(page.id)
            else await service.pages.favoritePage(page.id)
        } catch (error) {
            console.error('Failed to update favorite state:', error)
            setFavorite(previous)
            toast.error(t('favorites.updateFailed', 'Failed to update favorite'))
        }
    }, [favorite, page.id, service, t])

    const copyLink = useCallback(async () => {
        try {
            await window.navigator.clipboard.writeText(`${window.location.origin}/space-detail/${spaceId}/page/edit/${page.id}`)
            toast.success(t('editor.linkCopied', 'Link copied'))
        } catch (error) {
            console.error('Failed to copy page link:', error)
            toast.error(t('editor.linkCopyFailed', 'Failed to copy link'))
        }
    }, [page.id, spaceId, t])

    const moveToTrash = useCallback(async () => {
        try {
            await service.pages.movePageToTrash(page.id)
            navigator.go({ to: `/space-detail/${spaceId}` })
        } catch (error) {
            console.error('Failed to move component page to trash:', error)
            toast.error(t('editor.moveToTrashFailed', 'Failed to move to trash'))
        }
    }, [navigator, page.id, service, spaceId, t])

    return (
        <div className="flex h-full w-full flex-col bg-background">
            <header className="flex h-11 shrink-0 items-center justify-between border-b px-1">
                <div className="min-w-0 flex-1 overflow-hidden px-1 text-sm">
                    <PageBreadcrumb
                        currentPageId={page.id}
                        pageTree={(page as any).parents}
                        spaceId={spaceId}
                        currentTitle={savedTitle}
                    />
                </div>
                <div className="flex shrink-0 items-center gap-1 px-1">
                    <SharePanel pageTitle={savedTitle}>
                        <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-muted-foreground hover:text-foreground">
                            <UserPlus className="h-3.5 w-3.5" />
                            <span className="hidden text-xs sm:inline">{t('editor.share', 'Share')}</span>
                        </Button>
                    </SharePanel>
                    <Separator orientation="vertical" className="h-5" />
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => void toggleFavorite()}
                        title={favorite ? t('favorites.remove', 'Remove from favorites') : t('favorites.add', 'Add to favorites')}
                    >
                        <Star className={`h-3.5 w-3.5 ${favorite ? 'fill-yellow-400 text-yellow-400' : ''}`} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void copyLink()} title={t('editor.copyLink', 'Copy link')}>
                        <Link className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => void moveToTrash()} title={t('editor.moveToTrash', 'Move to trash')}>
                        <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </header>
            <main className="flex min-h-0 flex-1 flex-col overflow-auto">
                <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-6 sm:px-8">
                    {editableTitle ? (
                        <input
                            value={title}
                            disabled={savingTitle}
                            onChange={(event) => setTitle(event.target.value)}
                            onBlur={() => void saveTitle()}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') event.currentTarget.blur()
                                if (event.key === 'Escape') {
                                    setTitle(savedTitle)
                                    event.currentTarget.blur()
                                }
                            }}
                            className="mb-6 w-full bg-transparent text-3xl font-bold tracking-tight outline-none disabled:opacity-60"
                            aria-label={t('page.title', 'Page title')}
                        />
                    ) : (
                        <h1 className="mb-6 text-3xl font-bold tracking-tight">{savedTitle}</h1>
                    )}
                    <div aria-hidden={!active} className="min-h-0 flex-1">
                        {children}
                    </div>
                </div>
            </main>
        </div>
    )
}

const MissingPageType: React.FC<{ page: PageRecord; spaceId: string; active: boolean }> = ({ page, spaceId, active }) => {
    const { t } = useTranslation()
    const copyType = async () => {
        try {
            await window.navigator.clipboard.writeText(page.pageType ?? '')
            toast.success(t('page.typeCopied', 'Page type copied'))
        } catch {
            toast.error(t('page.typeCopyFailed', 'Failed to copy page type'))
        }
    }

    return (
        <ComponentPageFrame page={page} spaceId={spaceId} active={active}>
            <div className="flex h-full items-center justify-center p-6">
                <div className="flex max-w-xl flex-col items-center gap-4 rounded-xl border bg-card p-8 text-center shadow-sm">
                    <Puzzle className="h-10 w-10 text-muted-foreground" />
                    <div>
                        <h2 className="font-semibold">{t('page.rendererUnavailable', 'Page renderer unavailable')}</h2>
                        <p className="mt-2 text-sm text-muted-foreground">
                            {t('page.rendererUnavailableDescription', 'The plugin that provides this page type may be disabled, missing, or incompatible.')}
                        </p>
                    </div>
                    <code className="max-w-full overflow-auto rounded bg-muted px-3 py-2 text-xs">{page.pageType}</code>
                    <Button variant="outline" className="gap-2" onClick={() => void copyType()}>
                        <Copy className="h-4 w-4" />
                        {t('page.copyTypeId', 'Copy page type ID')}
                    </Button>
                </div>
            </div>
        </ComponentPageFrame>
    )
}

export const PageHost: React.FC<PageHostProps> = ({ pageId, spaceId: explicitSpaceId, active = true }) => {
    const service = useSpacePageService()
    const { updateMeta } = usePageTabs(explicitSpaceId)
    const [page, setPage] = useState<PageRecord | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(false)
    const pageType = usePageType(page?.pageType)

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        setError(false)
        service.pages.getPage(pageId)
            .then((record) => {
                if (cancelled) return
                setPage(record)
                updateMeta(pageId, {
                    title: record.title,
                    icon: (record.icon as any)?.type === 'IMAGE' ? undefined : (record.icon as any)?.icon,
                })
            })
            .catch((loadError) => {
                if (cancelled) return
                console.error('Failed to load page host metadata:', loadError)
                setError(true)
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })
        return () => { cancelled = true }
    }, [pageId, service, updateMeta])

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
            </div>
        )
    }

    if (error || !page) {
        return (
            <div className="flex h-full items-center justify-center p-6">
                <div className="flex max-w-md flex-col items-center gap-3 rounded-lg border p-8 text-center">
                    <AlertCircle className="h-9 w-9 text-destructive" />
                    <p className="font-medium">Failed to load page</p>
                </div>
            </div>
        )
    }

    const spaceId = explicitSpaceId ?? page.spaceId
    if (!spaceId) return null
    const readOnly = page.permission != null && !hasPermission(page.permission, 'WRITE')

    if (!page.pageType) {
        return <PageEditor pageId={pageId} spaceId={spaceId} active={active} initialPage={page} readOnly={readOnly} />
    }

    if (!pageType) {
        return <MissingPageType page={page} spaceId={spaceId} active={active} />
    }

    if (pageType.renderer.type === 'editor-component') {
        return (
            <PageEditor
                pageId={pageId}
                spaceId={spaceId}
                active={active}
                initialPage={page}
                presentation="component"
                readOnly={readOnly}
            />
        )
    }

    const Component = pageType.renderer.component

    return (
        <ComponentPageFrame page={page} pageType={pageType} spaceId={spaceId} active={active} editableTitle={!readOnly}>
            <PluginPageBoundary pageType={pageType}>
                <Component
                    page={page}
                    pageId={page.id}
                    spaceId={spaceId}
                    active={active}
                    readOnly={readOnly}
                    mode={readOnly ? 'view' : 'edit'}
                />
            </PluginPageBoundary>
        </ComponentPageFrame>
    )
}
