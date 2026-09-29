import React from 'react'
import { Button, Badge } from '@kn/ui'
import { ExternalLink, FolderOpen, PanelRight, Users, Loader2 } from '@kn/icon'
import {
    useNavigator,
    useSpacePageService,
    useTranslation,
    type AgentArtifact,
    type AgentArtifactProps,
    type AgentToolResultProps,
    type PageTreeNode,
    type Space,
} from '@kn/common'

/**
 * Space artifact rendering — plugin-main's counterpart to PageArtifact.
 *
 * Core maps a successful `createSpace` result to `{ kind: 'space', id, title }`;
 * this file provides the conversation card and the side-pane view. Keeping it
 * here (not in core) preserves the layering core states explicitly: the kernel
 * knows nothing about pages OR spaces, it only mounts what a plugin registered.
 *
 * Unlike a page, a space has no room/editor to embed, so the preview is a
 * read-only summary: identity + the page tree. Editing still happens on the
 * space route, which is what the "前往空间" action is for.
 */

interface CreatedSpaceResult {
    success?: boolean
    created?: boolean
    name?: string
    type?: string
    spaceId?: string
}

/** Result → artifact. Mirrors core's mapper so a card can render standalone. */
export const asSpaceArtifact = (
    result: unknown,
    artifact?: AgentArtifact | null,
): AgentArtifact | null => {
    if (artifact?.kind === 'space') return artifact
    const value = (result ?? {}) as CreatedSpaceResult
    if (!value.spaceId) return null
    return {
        kind: 'space',
        id: String(value.spaceId),
        title: typeof value.name === 'string' ? value.name : undefined,
        data: { type: value.type },
    }
}

const spaceTypeLabel = (type: string | undefined, t: (key: string, options?: any) => string) =>
    type === 'COLLABORATION'
        ? t('spaceArtifact.typeCollaboration')
        : type === 'PERSONAL'
            ? t('spaceArtifact.typePersonal')
            : t('spaceArtifact.typeSpace')

/** Conversation card for a created space: name + open actions. */
export const SpaceArtifactCard: React.FC<AgentToolResultProps> = ({ result, artifact, openArtifact }) => {
    const { t } = useTranslation()
    const navigator = useNavigator()
    const space = asSpaceArtifact(result, artifact)
    if (!space) return null
    const type = (space.data as { type?: string } | undefined)?.type

    return (
        <div className="mt-1.5 ml-[22px] rounded-lg border border-border/60 bg-card/40 p-2">
            <div className="flex items-center gap-2">
                <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-[12px] font-medium">
                    {space.title || t('spaceArtifact.untitled')}
                </span>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1 px-2 text-[11px]"
                    onClick={() => openArtifact(space)}
                >
                    <PanelRight className="h-3 w-3" />
                    {t('pageArtifact.openBeside')}
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1 px-2 text-[11px]"
                    onClick={() => navigator.go({ to: `/space-detail/${space.id}` })}
                >
                    <ExternalLink className="h-3 w-3" />
                    {t('spaceArtifact.openSpace')}
                </Button>
            </div>
            <p className="mt-1 pl-[22px] text-[11px] text-muted-foreground">
                {spaceTypeLabel(type, t)}
            </p>
        </div>
    )
}

const flattenTree = (nodes: PageTreeNode[], out: PageTreeNode[] = []): PageTreeNode[] => {
    for (const node of nodes) {
        out.push(node)
        if (Array.isArray(node.children) && node.children.length > 0) flattenTree(node.children, out)
    }
    return out
}

/**
 * Side-pane view: the space's identity plus its page tree.
 *
 * Read-only by design — a space is a container, not a document, so there is
 * nothing to edit in place. Links open the real space route.
 */
export const SpacePreviewPane: React.FC<AgentArtifactProps> = ({ artifact }) => {
    const { t } = useTranslation()
    const navigator = useNavigator()
    const service = useSpacePageService()
    const [space, setSpace] = React.useState<Space | null>(null)
    const [pages, setPages] = React.useState<PageTreeNode[]>([])
    const [loading, setLoading] = React.useState(true)
    const [failed, setFailed] = React.useState(false)

    React.useEffect(() => {
        let cancelled = false
        setLoading(true)
        setFailed(false)
        Promise.all([
            service.spaces.getSpace(artifact.id),
            service.pages.getPageTree({ spaceId: artifact.id }),
        ])
            .then(([spaceRecord, tree]) => {
                if (cancelled) return
                setSpace(spaceRecord)
                setPages(flattenTree(tree).slice(0, 50))
            })
            .catch(() => {
                if (!cancelled) setFailed(true)
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })
        return () => { cancelled = true }
    }, [artifact.id, service])

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
            </div>
        )
    }
    if (failed) {
        return <p className="p-4 text-xs text-muted-foreground">{t('spaceArtifact.loadFailed')}</p>
    }

    const title = space?.name || artifact.title || t('spaceArtifact.untitled')

    return (
        <div className="flex flex-col gap-3 p-4">
            <div className="flex min-w-0 flex-col gap-1">
                <div className="flex min-w-0 items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{title}</span>
                    <Badge variant="secondary" className="shrink-0 gap-1 text-[10px]">
                        {space?.type === 'COLLABORATION' && <Users className="h-3 w-3" />}
                        {spaceTypeLabel(space?.type, t)}
                    </Badge>
                </div>
                {space?.description && (
                    <p className="text-xs leading-relaxed text-muted-foreground">{space.description}</p>
                )}
            </div>

            <div className="flex flex-wrap gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 px-2 text-[11px]"
                    onClick={() => navigator.go({ to: `/space-detail/${artifact.id}` })}
                >
                    <ExternalLink className="h-3 w-3" />
                    {t('spaceArtifact.openSpace')}
                </Button>
            </div>

            <div className="flex min-w-0 flex-col gap-1">
                <span className="text-[11px] font-medium text-muted-foreground">
                    {t('spaceArtifact.pageCount', { count: pages.length })}
                </span>
                {pages.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t('spaceArtifact.emptyPages')}</p>
                ) : (
                    <ul className="flex min-w-0 flex-col">
                        {pages.map((page) => (
                            <li key={String(page.id)} className="min-w-0">
                                <button
                                    type="button"
                                    className="w-full min-w-0 truncate rounded px-1 py-1 text-left text-[12px] text-foreground/80 hover:bg-muted hover:text-foreground"
                                    onClick={() =>
                                        navigator.go({ to: `/space-detail/${artifact.id}/page/edit/${page.id}` })
                                    }
                                >
                                    {page.title || page.name || t('pageArtifact.untitled')}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    )
}
