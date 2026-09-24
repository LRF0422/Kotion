/**
 * Artifact collection — the kernel's session-level abstraction over
 * {@link AgentArtifact}.
 *
 * A conversation may touch many targets (pages, later spreadsheets/charts, …).
 * This module derives "what did this session produce?" from the tool
 * invocations in its transcript, using each tool's registered
 * `artifactFromResult` mapper. It is pure (no React), so it is cheap and
 * testable; the React half lives in ./agent-artifacts.
 *
 * Derived, not stored: the transcript is the source of truth, so the shelf
 * survives a refresh for free and can never drift from the conversation.
 */

import type { AgentArtifact } from '../plugin-agent'

/** One completed tool invocation — the minimal input for derivation. */
export interface AgentToolInvocation {
    /** Tool name as it appears on the wire (matches the mapper registry key). */
    tool: string
    args?: unknown
    result?: unknown
}

export type AgentArtifactMapper = (result: unknown, args: unknown) => AgentArtifact | null

/** Stable identity of an artifact within a conversation. */
export function agentArtifactKey(artifact: AgentArtifact): string {
    return `${artifact.kind}:${artifact.id}`
}

/**
 * Pure: derive the deduped artifact list from invocations, newest first.
 * Duplicates (the agent touching the same page again) keep the latest value
 * and a single slot.
 */
export function collectAgentArtifacts(
    invocations: readonly AgentToolInvocation[],
    mappers: ReadonlyMap<string, AgentArtifactMapper>,
): AgentArtifact[] {
    const byKey = new Map<string, AgentArtifact>()
    for (const invocation of invocations) {
        const mapper = mappers.get(invocation.tool)
        if (!mapper) continue
        const artifact = mapper(invocation.result, invocation.args)
        if (artifact) byKey.set(agentArtifactKey(artifact), artifact)
    }
    return Array.from(byKey.values()).reverse()
}
