/**
 * AgentToolResultCard — mounts a plugin-registered card for a tool result.
 *
 * It owns two states of one call:
 *  - **finished** — route the result to the plugin renderer registered for the
 *    tool, or return null when none is registered so the caller keeps its
 *    generic rendering (the existing JSON detail block).
 *  - **awaiting approval** — while the call is still running and the tool asked
 *    for a human decision, render the approval UI in place of the (still empty)
 *    result. A plugin may own that UI through `request.kind`; otherwise the
 *    surface injects its generic card via {@link AgentToolResultCardProps.ApprovalCard}
 *    (the kernel must not depend on @kn/ui, so the host supplies the component).
 *
 * A crashed renderer is isolated by an error boundary and simply disappears —
 * a broken card must never take the conversation down.
 */

import React, { useCallback } from 'react'
import type { ComponentType } from 'react'
import type { ToolApprovalDecision, ToolApprovalRequest } from '../types'
import type { AgentArtifact, AgentToolResultProps } from '../plugin-agent'
import { toolApprovals } from '../agent/tool-approval'
import { useAgentPane } from './agent-pane'
import { useAgentToolArtifactMappers, useAgentToolRenderers } from './use-agent-renderers'
import { useToolApproval } from './use-tool-approval'

/** Props the host-injected generic approval card receives from the kernel. */
export interface AgentApprovalCardProps {
    request: ToolApprovalRequest
    /** Resolve the pending approval; a no-op once it has already been settled. */
    onDecide: (decision: ToolApprovalDecision) => void
}

export interface AgentToolResultCardProps {
    tool: string
    /** Already-sanitized args (see plugin-ai chat-helpers#toolCallsToSteps). */
    args?: unknown
    /** Already-sanitized result. */
    result?: unknown
    artifact?: AgentArtifact | null
    /** Delegated sub-run that issued the call, when any. */
    owner?: string | null
    /**
     * Stable tool-call id. The approval registry files decisions under it, so
     * a card rendered from the live state machine and one rendered from the
     * registry always settle the same call.
     */
    callId?: string | null
    /** Live call status; an approval only replaces the result while running. */
    status?: 'running' | 'success' | 'error'
    /**
     * Approval carried by the state machine. Preferred over the registry: a
     * replayed transcript still has it after the in-memory entry is gone.
     */
    approval?: { request: ToolApprovalRequest; decision?: ToolApprovalDecision } | null
    /**
     * Extra decision handler supplied by the caller (chained after the registry
     * decision). The registry settle is what resumes the executor's promise.
     */
    onDecide?: (decision: ToolApprovalDecision) => void
    /** Host generic approval card; injected by whichever surface renders the step. */
    ApprovalCard?: ComponentType<AgentApprovalCardProps>
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

const CardBody: React.FC<AgentToolResultCardProps> = ({
    tool,
    args,
    result,
    artifact,
    owner,
    callId,
    status,
    approval,
    onDecide,
    ApprovalCard,
}) => {
    const renderers = useAgentToolRenderers()
    const artifactMappers = useAgentToolArtifactMappers()
    const sheet = useAgentPane()
    // Registry fallback: a surface that does not replay the state machine can
    // still show the approval card from the live channel.
    const registryEntry = useToolApproval(callId)

    // One decide path for every card: settle the registry (idempotent; this is
    // what resumes the tool's promise) and then let the caller observe it.
    const decide = useCallback((decision: ToolApprovalDecision) => {
        if (callId) toolApprovals.decide(callId, decision)
        onDecide?.(decision)
    }, [callId, onDecide])

    // A recorded decision means the approval is over; only a registry entry is
    // transient (it is removed the moment the call is settled).
    const pendingRequest = approval
        ? (approval.decision ? undefined : approval.request)
        : registryEntry?.request
    const running = status === undefined || status === 'running'

    if (pendingRequest && running) {
        // A plugin may own this approval UI by kind; otherwise fall back to the
        // host's generic card. Without either there is nothing to render — the
        // running row above still tells the user the call is waiting.
        const ApprovalRenderer = pendingRequest.kind
            ? renderers.get(pendingRequest.kind)
            : undefined
        if (ApprovalRenderer) {
            const props: AgentToolResultProps = {
                tool,
                args,
                result,
                artifact: artifact ?? null,
                owner,
                openArtifact: sheet.openArtifact,
                openInPage: sheet.openInPage,
                status: status ?? 'running',
                approval: { request: pendingRequest },
                onDecide: decide,
            }
            return <ApprovalRenderer {...props} />
        }
        if (ApprovalCard) {
            return <ApprovalCard request={pendingRequest} onDecide={decide} />
        }
        return null
    }

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
        status,
        approval,
        onDecide: decide,
    }
    return <Renderer {...props} />
}

export const AgentToolResultCard: React.FC<AgentToolResultCardProps> = (props) => (
    <CardBoundary tool={props.tool}>
        <CardBody {...props} />
    </CardBoundary>
)
