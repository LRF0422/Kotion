import React from 'react'
import { Button } from '@kn/ui'
import { ExternalLink, FileText, PanelRight } from '@kn/icon'
import {
    PageEditWindow,
    useTranslation,
    type AgentArtifact,
    type AgentArtifactProps,
    type AgentToolResultProps,
} from '@kn/common'

/**
 * Page artifact rendering — plugin-main's half of the M3/S2 vertical.
 *
 * Core maps a successful \`createPage\` / \`openPageSide\` result to
 * \`{ kind: 'page', id, title, spaceId }\`; this file provides the conversation
 * card and the side-pane view. The kernel knows nothing about pages.
 *
 * The pane mounts the SAME editor stack as the floating page window
 * (PageEditWindow in embedded mode): a full CollaborationEditor on the page's
 * Y.Doc room. It is therefore fully editable AND live: the agent edits the page
 * through its own editor on the same room, so its changes appear here in real
 * time with no refetch.
 */

interface CreatedPageResult {
    success?: boolean
    pageId?: string
    title?: string
    spaceId?: string
    placement?: string
}

const asPageArtifact = (
    result: unknown,
    artifact?: AgentArtifact | null,
): AgentArtifact | null => {
    if (artifact?.kind === 'page') return artifact
    const value = (result ?? {}) as CreatedPageResult
    if (!value.pageId) return null
    return {
        kind: 'page',
        id: String(value.pageId),
        title: typeof value.title === 'string' ? value.title : undefined,
        spaceId: value.spaceId ? String(value.spaceId) : undefined,
        subtitle: value.placement,
    }
}

/** Conversation card for a created/opened page: title + open actions. */
export const PageArtifactCard: React.FC<AgentToolResultProps> = ({ result, artifact, openArtifact, openInPage }) => {
    const { t } = useTranslation()
    const page = asPageArtifact(result, artifact)
    if (!page) return null

    return (
        <div className="mt-1.5 ml-[22px] rounded-lg border border-border/60 bg-card/40 p-2">
            <div className="flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-[12px] font-medium">
                    {page.title || t('pageArtifact.untitled')}
                </span>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1 px-2 text-[11px]"
                    onClick={() => openArtifact(page)}
                >
                    <PanelRight className="h-3 w-3" />
                    {t('pageArtifact.openBeside')}
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1 px-2 text-[11px]"
                    onClick={() => openInPage(page)}
                >
                    <ExternalLink className="h-3 w-3" />
                    {t('pageArtifact.openPage')}
                </Button>
            </div>
            {page.subtitle && (
                <p className="mt-1 pl-[22px] text-[11px] text-muted-foreground">{page.subtitle}</p>
            )}
        </div>
    )
}

/**
 * Side-pane view: the real page editor (embedded), bound to the page's
 * collaboration room — full functionality + real-time agent edits.
 */
export const PagePreviewPane: React.FC<AgentArtifactProps> = ({ artifact, close }) => (
    <div className="h-full min-h-0">
        <PageEditWindow pageId={artifact.id} embedded onClose={close} />
    </div>
)
