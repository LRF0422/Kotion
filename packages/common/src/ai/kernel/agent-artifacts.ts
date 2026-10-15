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
import {
    collectAgentArtifacts,
    mergeAgentArtifacts,
    type AgentToolInvocation,
} from './agent-artifact-collect'
import { agentTargetKey } from './agent-target'
import { useBackgroundTasks } from '../agent/use-background-tasks'

export interface AgentArtifactShelf {
    /** Deduped artifacts of this conversation, newest first. */
    artifacts: AgentArtifact[]
    /** Key of the artifact currently shown in the side pane. */
    activeKey: string | null
    /** Show an artifact in the side pane. */
    open: (artifact: AgentArtifact) => void
}

export function useAgentArtifacts(
    invocations: readonly AgentToolInvocation[],
    /**
     * The conversation whose background tasks contribute artifacts. Omit on a
     * surface that cannot start long tasks; a conversation that can must pass it,
     * or a background build contributes nothing (the transcript only ever holds
     * the call's acknowledgement, never the build that came out of it).
     */
    conversationId?: string | null,
): AgentArtifactShelf {
    const pane = useAgentPane()
    const mappers = useAgentToolArtifactMappers()
    // Reactive on purpose: this changes when a task settles (placeholder → real
    // build), with no transcript write involved.
    const tasks = useBackgroundTasks(conversationId)
    const artifacts = useMemo(() => {
        // Transcript first, background tasks second: for the same (kind, id) the
        // task holds the newer truth — it is the half that knows the build
        // actually finished, and with what numbers.
        const fromTranscript = collectAgentArtifacts(invocations, mappers)
        // Without a conversation there is nothing to attribute a task to: showing
        // every conversation's tasks would be worse than showing none.
        const fromTasks = conversationId === undefined
            ? []
            : tasks
                .map(task => task.artifact)
                .filter((artifact): artifact is AgentArtifact => Boolean(artifact))
        return mergeAgentArtifacts(fromTranscript, fromTasks)
    }, [invocations, mappers, tasks, conversationId])
    return {
        artifacts,
        activeKey: agentTargetKey(pane.target),
        open: pane.openArtifact,
    }
}
