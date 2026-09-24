import React from 'react'
import { Button, Popover, PopoverContent, PopoverTrigger, cn } from '@kn/ui'
import { FileText, Layers } from '@kn/icon'
import { useTranslation, type AgentArtifact } from '@kn/common'

/**
 * Artifacts shelf — everything the agent touched or produced in this
 * conversation (pages, later spreadsheets/charts), collected from the
 * transcript via each tool's \`artifactFromResult\` mapper.
 *
 * Derived, not stored: the transcript is the source of truth, so the shelf
 * survives a refresh for free and can never drift from the conversation.
 * Clicking an entry opens it in the kernel side pane.
 */

interface ArtifactsShelfProps {
    artifacts: AgentArtifact[]
    /** Key (\`kind:id\`) of the artifact currently shown in the side pane. */
    activeKey?: string | null
    onOpen: (artifact: AgentArtifact) => void
}

const ICON_BY_KIND: Record<string, React.ComponentType<{ className?: string }>> = {
    page: FileText,
}

export const ArtifactsShelf: React.FC<ArtifactsShelfProps> = ({ artifacts, activeKey, onOpen }) => {
    const { t } = useTranslation()
    if (artifacts.length === 0) return null

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 shrink-0 gap-1 px-2 text-xs text-muted-foreground"
                    title={t('ai.artifacts.shelfTitle')}
                >
                    <Layers className="h-3.5 w-3.5" />
                    {t('ai.artifacts.shelf')}
                    <span className="rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">
                        {artifacts.length}
                    </span>
                </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[280px] p-1.5">
                <div className="px-2 py-1 text-[11px] font-medium text-muted-foreground">
                    {t('ai.artifacts.shelfTitle')}
                </div>
                <div className="max-h-[320px] overflow-y-auto">
                    {artifacts.map((artifact) => {
                        const key = `${artifact.kind}:${artifact.id}`
                        const Icon = ICON_BY_KIND[artifact.kind] ?? FileText
                        return (
                            <Button
                                key={key}
                                variant="ghost"
                                onClick={() => onOpen(artifact)}
                                className={cn(
                                    'h-auto w-full justify-start gap-2 rounded-md px-2 py-1.5',
                                    activeKey === key && 'bg-muted',
                                )}
                            >
                                <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                <span className="min-w-0 flex-1 truncate text-left text-[12px]">
                                    {artifact.title || artifact.id}
                                </span>
                                <span className="shrink-0 text-[10px] text-muted-foreground/70">
                                    {t(`ai.artifacts.kind.${artifact.kind}`, { defaultValue: artifact.kind })}
                                </span>
                            </Button>
                        )
                    })}
                </div>
            </PopoverContent>
        </Popover>
    )
}
