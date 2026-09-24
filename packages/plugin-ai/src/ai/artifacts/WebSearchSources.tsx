import React from 'react'
import { Button } from '@kn/ui'
import { ExternalLink, PanelRight } from '@kn/icon'
import { useTranslation, type AgentArtifact, type AgentArtifactProps, type AgentToolResultProps } from '@kn/common'

/**
 * Plugin-side artifact rendering — the whole point of the kernel's renderer
 * pipeline: the AI plugin owns `web_search`'s presentation AND its artifact
 * mapping, and the kernel only mounts what was registered. No core code knows
 * what a "source list" is.
 */

interface WebSearchItem {
    title?: string
    url?: string
    content?: string
}

interface WebSearchPayload {
    query?: string
    count?: number
    results?: WebSearchItem[]
}

const readResults = (value: unknown): WebSearchItem[] => {
    const payload = (value ?? {}) as WebSearchPayload
    return Array.isArray(payload.results) ? payload.results : []
}

/**
 * `web_search` → `source-list` artifact. `web_search` is a backend builtin, so
 * no local tool implementation can own this mapping; declaring it on the tool
 * renderer is how the artifact reaches the shelf and the working target.
 * The id is the query, so distinct searches are distinct artifacts and a
 * repeated query merges.
 */
export const webSearchArtifact = (result: unknown): AgentArtifact | null => {
    const payload = (result ?? {}) as WebSearchPayload
    const results = readResults(result)
    if (results.length === 0) return null
    const query = payload.query?.trim()
    return {
        kind: 'source-list',
        id: query || 'web_search',
        title: query || undefined,
        data: { query: payload.query, results },
    }
}

/** Conversation card: a compact, clickable source list plus "open beside". */
export const WebSearchSourcesCard: React.FC<AgentToolResultProps> = ({ result, openArtifact }) => {
    const { t } = useTranslation()
    const payload = (result ?? {}) as WebSearchPayload
    const results = readResults(result)
    const artifact = webSearchArtifact(result)
    if (!artifact || results.length === 0) return null

    return (
        <div className="mt-1.5 ml-[22px] rounded-lg border border-border/60 bg-card/40 p-2">
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <span className="font-medium">
                    {t('ai.artifacts.sourceCount', { count: payload.count ?? results.length })}
                </span>
                <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto h-6 gap-1 px-2 text-[11px]"
                    onClick={() => openArtifact(artifact)}
                >
                    <PanelRight className="h-3 w-3" />
                    {t('ai.artifacts.openBeside')}
                </Button>
            </div>
            <ul className="mt-1 flex flex-col gap-1">
                {results.slice(0, 3).map((item, index) => (
                    <li key={item.url || index} className="min-w-0">
                        <a
                            href={item.url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex min-w-0 items-center gap-1 text-[12px] text-primary hover:underline"
                        >
                            <ExternalLink className="h-3 w-3 shrink-0" />
                            <span className="truncate">{item.title || item.url}</span>
                        </a>
                    </li>
                ))}
            </ul>
        </div>
    )
}

/** Side-pane preview: the full source list with snippets. */
export const SourcesSheetView: React.FC<AgentArtifactProps> = ({ artifact }) => {
    const { t } = useTranslation()
    const payload = (artifact.data ?? {}) as WebSearchPayload
    const results = readResults(artifact.data)
    if (results.length === 0) {
        return (
            <p className="p-4 text-xs text-muted-foreground">{t('ai.artifacts.emptySources')}</p>
        )
    }

    return (
        <div className="flex flex-col gap-4 p-4">
            {payload.query && (
                <p className="text-xs text-muted-foreground">
                    {t('ai.artifacts.queryLabel', { query: payload.query })}
                </p>
            )}
            {results.map((item, index) => (
                <div key={item.url || index} className="flex min-w-0 flex-col gap-1">
                    <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm font-medium text-primary hover:underline"
                    >
                        {item.title || item.url}
                    </a>
                    {item.url && (
                        <span className="truncate text-[11px] text-muted-foreground">{item.url}</span>
                    )}
                    {item.content && (
                        <p className="text-xs leading-relaxed text-foreground/80">{item.content}</p>
                    )}
                </div>
            ))}
        </div>
    )
}
