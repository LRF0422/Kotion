import React from 'react'
import { Button } from '@kn/ui'
import { ExternalLink, X } from '@kn/icon'
import {
    setAgentPaneHostImpl,
    useAgentArtifactRenderers,
    useTranslation,
    type AgentPaneHostProps,
} from '@kn/common'

/**
 * Agent pane host — the chrome for the kernel's side-peek artifact preview.
 *
 * A bordered column, NOT an overlay: KernelHomePage lays it out next to the
 * conversation so nothing is covered. It stays deliberately dumb: it owns the
 * header/close and mounts whatever plugin renderer matches the artifact kind.
 * Registered once from App.tsx (the contract lives in @kn/common, which cannot
 * import @kn/ui).
 */
export const AgentPaneHostImpl: React.FC<AgentPaneHostProps> = ({ artifact, onClose, onOpenInPage }) => {
    const { t } = useTranslation()
    const artifactRenderers = useAgentArtifactRenderers()
    const Renderer = artifactRenderers.get(artifact.kind)
    const title = artifact.title ?? t('agentPane.preview')

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="flex shrink-0 items-center gap-1.5 border-b px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{title}</span>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                    onClick={() => onOpenInPage(artifact)}
                >
                    <ExternalLink className="h-3.5 w-3.5" />
                    {t('agentPane.openPage')}
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground"
                    onClick={onClose}
                    aria-label={t('agentPane.close')}
                >
                    <X className="h-4 w-4" />
                </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
                {Renderer ? (
                    <Renderer artifact={artifact} close={onClose} openInPage={onOpenInPage} />
                ) : (
                    <div className="p-4 text-xs text-muted-foreground">
                        {t('agentPane.noRenderer', { kind: artifact.kind })}
                    </div>
                )}
            </div>
        </div>
    )
}

/** Register with the kernel bridge. Called once from App.tsx. */
export function registerAgentPaneHost(): void {
    setAgentPaneHostImpl(AgentPaneHostImpl)
}
