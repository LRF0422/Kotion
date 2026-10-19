/** Types for `scheduler.mjs`. Keep in step with the implementation. */

export interface ScheduledTask {
    taskId: string
    name?: string
    intervalMs: number
    initialDelayMs: number
    nextAt: number
    createdAt: number
    runs: number
    missed: number
    keepAwake: boolean
}

export interface TickEvent {
    taskId: string
    scheduledAt: number
    firedAt: number
    missed: number
    run: number
}

export interface TaskScheduler {
    schedule(raw: unknown): ScheduledTask
    list(): ScheduledTask[]
    cancel(taskId: string): boolean
    cancelAll(): number
    dispose(): void
}

export const BACKGROUND_MIN_INTERVAL_MS: number
export const BACKGROUND_MAX_INTERVAL_MS: number
export const BACKGROUND_MAX_TASKS: number
export class BackgroundParamError extends Error {}

export function normalizeScheduleOptions(raw: unknown): {
    taskId: string
    name: string
    intervalMs: number
    initialDelayMs: number
    keepAwake: boolean
}

export function createTaskScheduler(options: {
    now?: () => number
    onTick: (event: TickEvent) => void
    setKeepAwake?: (taskId: string, wants: boolean) => boolean
    log?: (message: string) => void
}): TaskScheduler
