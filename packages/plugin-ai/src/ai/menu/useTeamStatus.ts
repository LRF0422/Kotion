import { useState, useEffect } from 'react'
import type {
    TeamState,
    TeamMember,
    TeamPhase,
    AnnotationData,
    TeamAssembledEvent,
    MemberStatusEvent,
    TeamPhaseEvent,
    OrchestrationStatusEvent,
    DelegateStartEvent,
    SubagentStatusEvent,
    DelegateResultEvent,
    AgentStatusEvent,
} from './chat-types'

/**
 * Hook to parse and track AgentTeam status from stream annotations.
 * Accepts annotation data array (from Data Stream v2 protocol code `8:` events).
 * Now handles both legacy team_status events and spec-aligned annotation events.
 */
export function useTeamStatus(data: AnnotationData[] | undefined): TeamState {
    const [state, setState] = useState<TeamState>({
        members: [],
        phase: '',
        orchestrationMessage: '',
    })

    useEffect(() => {
        if (!data || data.length === 0) return

        for (const item of data) {
            const itemType = (item as any).type

            // ============ Spec-aligned annotation types ============

            if (itemType === 'delegate_start') {
                // Map delegate_start -> team assembly
                const event = item as DelegateStartEvent
                const subTasks = Array.isArray(event.subTasks) ? event.subTasks : []
                setState((prev) => ({
                    ...prev,
                    phase: 'executing',
                    members: subTasks.map((st, i) => ({
                        id: st.agentId,
                        name: st.agentId,
                        subTask: st.description,
                        dependencyLevel: i,
                        status: 'spawned' as const,
                    })),
                }))
            } else if (itemType === 'subagent_status') {
                // Map subagent_status -> member status update
                const event = item as SubagentStatusEvent
                setState((prev) => ({
                    ...prev,
                    members: prev.members.map((m) =>
                        m.id === event.agentId
                            ? { ...m, status: event.status, detail: event.detail }
                            : m
                    ),
                }))
            } else if (itemType === 'delegate_result') {
                // Map delegate_result -> team completion
                const event = item as DelegateResultEvent
                setState((prev) => ({
                    ...prev,
                    phase: 'completed',
                    orchestrationMessage: event.result,
                }))
            } else if (itemType === 'agent_status') {
                // Map agent_status -> orchestration message
                const event = item as AgentStatusEvent
                setState((prev) => ({
                    ...prev,
                    orchestrationMessage: event.phase === 'thinking'
                        ? 'Agent is thinking...'
                        : event.tool
                            ? `Agent is calling tool: ${event.tool}`
                            : '',
                }))
            }

            // ============ Legacy compat event types ============

            else if (itemType === 'team_status') {
                const event = (item as any).event
                switch (event) {
                    case 'team_assembled':
                        setState((prev) => ({
                            ...prev,
                            members: (item as TeamAssembledEvent).members,
                        }))
                        break
                    case 'member_status': {
                        const statusEvent = item as MemberStatusEvent
                        setState((prev) => ({
                            ...prev,
                            members: prev.members.map((m) =>
                                m.id === statusEvent.memberId
                                    ? { ...m, status: statusEvent.status, detail: statusEvent.detail }
                                    : m
                            ),
                        }))
                        break
                    }
                    case 'team_phase':
                        setState((prev) => ({
                            ...prev,
                            phase: (item as TeamPhaseEvent).phase,
                        }))
                        break
                }
            } else if (itemType === 'orchestration_status') {
                const orchEvent = item as OrchestrationStatusEvent
                setState((prev) => ({
                    ...prev,
                    phase: orchEvent.phase,
                    orchestrationMessage: orchEvent.message,
                }))
            }
        }
    }, [data])

    return state
}

/**
 * Reset team status (call when starting a new conversation)
 */
export function createInitialTeamState(): TeamState {
    return {
        members: [],
        phase: '',
        orchestrationMessage: '',
    }
}
