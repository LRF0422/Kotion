import type {
    AgentTaskEvent,
    AgentTaskState,
    CreateAgentTaskInput,
    ResumeAgentTaskInput,
} from './types'

/**
 * V3 AgentClient interface. UI components use this instead of calling fetch
 * or parsing SSE directly.
 */
export interface AgentClient {
    create(input: CreateAgentTaskInput, signal?: AbortSignal): Promise<AgentTaskState>
    state(taskId: string, signal?: AbortSignal): Promise<AgentTaskState>
    events(taskId: string, afterSeq: number, signal?: AbortSignal): AsyncGenerator<AgentTaskEvent>
    resume(taskId: string, input: ResumeAgentTaskInput, signal?: AbortSignal): AsyncGenerator<AgentTaskEvent>
    cancel(taskId: string, signal?: AbortSignal): Promise<void>
}
