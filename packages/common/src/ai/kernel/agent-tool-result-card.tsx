/**
 * AgentToolResultCard — mounts a plugin-registered card for a tool result.
 *
 * Returns null when no plugin registered a renderer for the tool, so the
 * caller keeps its generic rendering (the existing JSON detail block).
 * A crashed renderer is isolated by an error boundary and simply disappears —
 * a broken card must never take the conversation down.
 */

import React from 'react'
import type { AgentArtifact, AgentToolResultProps } from '../plugin-agent'
import { useAgentPane } from './agent-pane'
import { useAgentToolArtifactMappers, useAgentToolRenderers } from './use-agent-renderers'

export interface AgentToolResultCardProps {
    tool: string
    /** Already-sanitized args (see plugin-ai chat-helpers#toolCallsToSteps). */
    args?: unknown
    /** Already-sanitized result. */
    result?: unknown
    artifact?: AgentArtifact | null
    /** Delegated sub-run that issued the call, when any. */
    owner?: string | null
}

interface BoundaryState { failed: boolean }

class CardBoundary extends React.Component<
    { tool: string; children: React.ReactNode },
    BoundaryState
> {
    state: BoundaryState = { failed: false }

    static getDerivedStateFromError(): BoundaryState {
        return { failed: true }
    }

    componentDidCatch(error: unknown): void {
        console.warn(`[Agent] tool renderer for "${this.props.tool}" failed:`, error)
    }

    render(): React.ReactNode {
        return this.state.failed ? null : this.props.children
    }
}

const CardBody: React.FC<AgentToolResultCardProps> = ({ tool, args, result, artifact, owner }) => {
    const renderers = useAgentToolRenderers()
    const artifactMappers = useAgentToolArtifactMappers()
    const sheet = useAgentPane()
    const Renderer = renderers.get(tool)
    if (!Renderer) return null

    // Prefer an explicitly-passed artifact, otherwise let the tool
    // implementation's registered mapper derive one (the kernel data path).
    const mapper = artifactMappers.get(tool)
    const resolvedArtifact = artifact ?? (mapper ? mapper(result, args) : null)
    const props: AgentToolResultProps = {
        tool,
        args,
        result,
        artifact: resolvedArtifact,
        owner,
        openArtifact: sheet.openArtifact,
        openInPage: sheet.openInPage,
    }
    return <Renderer {...props} />
}

export const AgentToolResultCard: React.FC<AgentToolResultCardProps> = (props) => (
    <CardBoundary tool={props.tool}>
        <CardBody {...props} />
    </CardBoundary>
)
