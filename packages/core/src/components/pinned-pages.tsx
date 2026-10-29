import React, { useEffect, useMemo } from 'react'
import {
    FileService,
    PinnedPage,
    PinnedPagesPresentation,
    pinnedPageRoute,
    useNavigator,
    useOptionalService,
    useTranslation,
} from '@kn/common'
import {
    ContextMenuLabel,
    ContextMenuItem,
    ContextMenuSeparator,
    DateIcon,
    DateIconConfig,
    FlatEmoji,
    toast,
} from '@kn/ui'
import { FileText } from '@kn/icon'

/**
 * Shell-owned presentation for pages pinned to the main rail.
 *
 * The kernel owns *what* is pinned and how it is persisted (`PinnedPagesService`
 * in `@kn/common`); it deliberately imports no UI library, so every visual
 * decision — label, glyph, right-click menu — is injected from here through
 * `setPresentation`. Without it the rail still works, just with plain text
 * entries, which is what keeps the kernel testable.
 */
export function usePinnedPagesPresentation(): void {
    const pinnedPages = useOptionalService('pinnedPages')
    const { t } = useTranslation()

    const presentation = useMemo<PinnedPagesPresentation>(() => ({
        title: (page) => page.title?.trim() || t('shortcuts.untitled') || 'Untitled',
        icon: (page) => <PinnedPageGlyph page={page} />,
        menu: (page) => <PinnedPageMenu page={page} />,
    }), [t])

    // Registering the presentation re-publishes the rail entries, so this may
    // (and does) run after the service has already hydrated — see
    // `PinnedPagesService.setPresentation`. Clearing on unmount keeps a stale
    // renderer from holding on to a React tree that no longer exists.
    useEffect(() => {
        if (!pinnedPages) return
        pinnedPages.setPresentation(presentation)
        return () => pinnedPages.setPresentation(null)
    }, [pinnedPages, presentation])
}

/** OSS download fallback used by the page tree when no `fileService` answers. */
const FALLBACK_DOWNLOAD_URL = 'https://kotion.top:888/api/knowledge-resource/oss/endpoint/download'

/**
 * Rail glyph of one pinned page — mirrors `PageItemIcon` from the page tree
 * (EMOJI flattened, IMAGE resolved to a download URL, DATE as a mini calendar)
 * but sized for the rail and never empty: a pinned page keeps a slot even when
 * its icon payload is missing or unusable.
 */
const PinnedPageGlyph: React.FC<{ page: PinnedPage }> = ({ page }) => {
    const fileService = useOptionalService('fileService') as FileService | undefined
    const icon = page.icon

    if (!icon?.icon) {
        return <FileText className="h-5 w-5 text-muted-foreground" />
    }

    if (icon.type === 'DATE' && icon.config) {
        return <DateIcon config={icon.config as DateIconConfig} size={18} />
    }

    if (icon.type === 'IMAGE') {
        const name = icon.icon
        const url = /^(https?:|data:)/.test(name)
            ? name
            : fileService
                ? fileService.getDownloadUrl(name)
                : `${FALLBACK_DOWNLOAD_URL}?fileName=${name}`
        return (
            <img
                src={url}
                alt=""
                width={18}
                height={18}
                className="rounded-sm object-cover flex-shrink-0"
                draggable={false}
            />
        )
    }

    return <FlatEmoji emoji={icon.icon} size={18} />
}

/**
 * Body of a pinned entry's right-click menu.
 *
 * Rendered by the rail inside a `ContextMenuContent` (see `SiderMenu`), so this
 * only contributes items — it must not render the Radix root itself. Every
 * mutation is fire-and-forget: the service is optimistic and the rail repaints
 * before the durable write lands.
 */
const PinnedPageMenu: React.FC<{ page: PinnedPage }> = ({ page }) => {
    const pinnedPages = useOptionalService('pinnedPages')
    const navigator = useNavigator()
    const { t } = useTranslation()

    const snapshot = pinnedPages?.snapshot()
    const isHome = pinnedPages?.isHome(page.pageId) ?? false
    const isPinned = pinnedPages?.isPinned(page.pageId) ?? false
    // Unknown service ⇒ say nothing rather than promise a failure.
    const persistent = snapshot?.persistent ?? true

    const copyLink = async () => {
        const url = `${window.location.origin}${pinnedPageRoute(page)}`
        try {
            await window.navigator.clipboard.writeText(url)
        } catch {
            toast.error(t('shortcuts.copyFailed') || 'Failed to copy link')
        }
    }

    return (
        <>
            <ContextMenuItem onSelect={() => navigator.go({ to: pinnedPageRoute(page) })}>
                {t('shortcuts.open') || 'Open page'}
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => { void copyLink() }}>
                {t('shortcuts.copyLink') || 'Copy link'}
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => { void pinnedPages?.setHome(isHome ? null : page) }}>
                {isHome
                    ? t('shortcuts.unsetHome') || 'Unset home page'
                    : t('shortcuts.setAsHome') || 'Set as home page'}
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => { void pinnedPages?.unpin(page.pageId) }}>
                {t('shortcuts.unpin') || 'Unpin from main menu'}
            </ContextMenuItem>
            {!persistent && isPinned && (
                <ContextMenuLabel className="max-w-[13rem] whitespace-normal text-[11px] font-normal leading-snug text-amber-600 dark:text-amber-500">
                    {t('shortcuts.notSaved') || 'Not saved right now: this shortcut lasts until you quit'}
                </ContextMenuLabel>
            )}
        </>
    )
}
