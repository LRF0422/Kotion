import React from 'react'
import type { TeamState, TeamMember, TeamMemberStatus, TeamPhase } from './chat-types'

function getPhaseLabel(phase: string): string {
    const labels: Record<string, string> = {
        planning: 'Planning',
        assembling: 'Assembling Team',
        executing: 'Executing',
        synthesizing: 'Synthesizing Results',
        completed: 'Completed',
    }
    return labels[phase] || phase
}

function getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
        pending: 'Waiting',
        working: 'Running',
        completed: 'Done',
        error: 'Error',
    }
    return labels[status] || status
}

function StatusIcon({ status }: { status: string }) {
    const icons: Record<string, string> = {
        pending: '⏳',
        working: '🔄',
        completed: '✅',
        error: '❌',
    }
    return <span className="mr-1">{icons[status] || '❓'}</span>
}

function getStatusColor(status: TeamMemberStatus): string {
    switch (status) {
        case 'pending': return 'bg-gray-50 border-gray-200 dark:bg-gray-800 dark:border-gray-700'
        case 'working': return 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800'
        case 'completed': return 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800'
        case 'error': return 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800'
        default: return 'bg-gray-50 border-gray-200'
    }
}

function getPhaseColor(phase: string): string {
    switch (phase) {
        case 'planning': return 'text-yellow-600 dark:text-yellow-400'
        case 'assembling': return 'text-blue-600 dark:text-blue-400'
        case 'executing': return 'text-indigo-600 dark:text-indigo-400'
        case 'synthesizing': return 'text-purple-600 dark:text-purple-400'
        case 'completed': return 'text-green-600 dark:text-green-400'
        default: return 'text-gray-600 dark:text-gray-400'
    }
}

interface TeamStatusPanelProps {
    teamState: TeamState
}

export function TeamStatusPanel({ teamState }: TeamStatusPanelProps) {
    const { members, phase, orchestrationMessage } = teamState

    if (members.length === 0 && !phase) {
        return null
    }

    return (
        <div className="mx-2 mb-2 rounded-md border border-gray-200 bg-white/80 p-2 backdrop-blur-sm dark:border-gray-700 dark:bg-gray-900/80">
            {/* Phase indicator */}
            {phase && (
                <div className="mb-1.5 flex items-center gap-1.5">
                    <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400">
                        Phase:
                    </span>
                    <span className={`text-[10px] font-semibold ${getPhaseColor(phase)}`}>
                        {getPhaseLabel(phase)}
                    </span>
                    {phase !== 'completed' && (
                        <span className="inline-block h-1 w-1 animate-pulse rounded-full bg-blue-500" />
                    )}
                </div>
            )}

            {/* Orchestration message */}
            {orchestrationMessage && (
                <p className="mb-1.5 text-[10px] text-gray-600 dark:text-gray-300">
                    {orchestrationMessage}
                </p>
            )}

            {/* Team members grid */}
            {members.length > 0 && (
                <div className="space-y-1">
                    {members.map((member) => (
                        <div
                            key={member.id}
                            className={`flex items-center gap-1.5 rounded border px-2 py-1 transition-colors duration-300 ${getStatusColor(member.status)}`}
                        >
                            <StatusIcon status={member.status} />
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1">
                                    <span className="text-[10px] font-medium text-gray-800 dark:text-gray-200">
                                        {member.name}
                                    </span>
                                    <span className="text-[9px] text-gray-500 dark:text-gray-400">
                                        {getStatusLabel(member.status)}
                                    </span>
                                </div>
                                <p className="truncate text-[9px] text-gray-500 dark:text-gray-400">
                                    {member.subTask}
                                </p>
                                {member.detail && member.status === 'error' && (
                                    <p className="mt-0.5 text-[10px] text-red-500">{member.detail}</p>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

export default TeamStatusPanel
