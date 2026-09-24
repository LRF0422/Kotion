/**
 * useAgentArtifacts — the session artifact shelf, as a kernel concept.
 *
 * Any surface can render a "产物" list without knowing about business types:
 * pass the conversation's tool invocations, get the deduped artifacts plus the
 * pane binding (which one is open, how to open one).
 */

import { useMemo } from 'react'
import type { AgentArtifact } from '../plugin-agent'
import { useAgentPane } from './agent-pane'
import { useAgentToolArtifactMappers } from './use-agent-renderers'
import { collectAgentArtifacts, type AgentToolInvocation } from './agent-artifact-collect'
import { agentTargetKey } from './agent-target'

export interface AgentArtifactShelf {
    /** Deduped artifacts of this conversation, newest first. */
    artifacts: AgentArtifact[]
    /** Key of the artifact currently shown in the side pane. */
    activeKey: string | null
    /** Show an artifact in the side pane. */
    open: (artifact: AgentArtifact) => void
}

export function useAgentArtifacts(invocations: readonly AgentToolInvocation[]): AgentArtifactShelf {
    const pane = useAgentPane()
    const mappers = useAgentToolArtifactMappers()
    const artifacts = useMemo(
        () => collectAgentArtifacts(invocations, mappers),
        [invocations, mappers],
    )
    return {
        artifacts,
        activeKey: agentTargetKey(pane.target),
        open: pane.openArtifact,
    }
}
