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
} from './chat-types'

/**
 * Hook to parse and track AgentTeam status from stream annotations.
 * Accepts annotation data array (from Data Stream v2 protocol code `8:` events).
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
            // Type guard: check 'type' property exists and matches
            const itemType = (item as any).type

            if (itemType === 'team_status') {
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
