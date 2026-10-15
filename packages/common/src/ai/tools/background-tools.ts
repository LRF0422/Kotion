/**
 * `listBackgroundTasks` / `getBackgroundTask` / `cancelBackgroundTask` — the
 * agent's side of the background-task contract (see
 * `../agent/background-tasks.ts`).
 *
 * These are protocol-level tools, not editor tools: they belong to every scope
 * (a workbench run with no document is exactly where a long build happens), so
 * they declare `scope: 'any'` / `requiresEditor: false` in the metadata registry
 * and are registered by core next to the discovery tools.
 *
 * Scoping rule: a session only ever sees ITS OWN tasks. The run's
 * `conversationId` comes from the execution context, so one conversation's
 * builds can never be waited on (or cancelled) by another.
 */

import type { ToolExecutionContext, ToolsRecord } from '../types'
import {
    MAX_BACKGROUND_WAIT_MS,
    DEFAULT_BACKGROUND_WAIT_MS,
    backgroundTasks,
    type BackgroundTaskView,
} from '../agent/background-tasks'

/** Tool results travel as messages; keep one result from eating the context. */
const MAX_RESULT_CHARS = 20_000

const clipResult = (value: unknown): { value: unknown; truncated?: boolean } => {
    if (value === undefined) return { value: undefined }
    let text: string
    try {
        text = JSON.stringify(value) ?? ''
    } catch {
        return { value: String(value) }
    }
    if (text.length <= MAX_RESULT_CHARS) return { value }
    return {
        value: text.slice(0, MAX_RESULT_CHARS),
        truncated: true,
    }
}

/** Compact listing entry: enough to choose a task, not the whole result. */
const summarizeTask = (task: BackgroundTaskView) => ({
    taskId: task.id,
    tool: task.tool,
    title: task.title,
    status: task.status,
    startedAt: task.startedAt,
    finishedAt: task.finishedAt ?? null,
    durationMs: task.finishedAt ? task.finishedAt - task.startedAt : Date.now() - task.startedAt,
    progress: task.progress ?? null,
    owner: task.owner ?? null,
    // A terminal task the agent has not seen is what a completion note is about;
    // saying so here keeps a poll from being the only way to learn it.
    seen: task.deliveredAt !== undefined,
    error: task.error ?? null,
    hasResult: task.result !== undefined,
})

const TERMINAL_HINT = '任务已结束。要用结果就调 getBackgroundTask({ taskId }) 取完整内容；列表里的 seen=false 表示你还没看过它的结果。'

/**
 * The two ways a caller identifies a task: explicitly by id, or "the one I am
 * obviously talking about" — the single running task of this session.
 */
const resolveTaskId = (
    requested: string | undefined,
    execCtx: ToolExecutionContext | undefined,
): { taskId?: string; error?: string } => {
    const wanted = typeof requested === 'string' ? requested.trim() : ''
    if (wanted) {
        return backgroundTasks.get(wanted) ? { taskId: wanted } : { error: `没有 taskId 为 "${wanted}" 的后台任务。` }
    }
    const mine = backgroundTasks.list({
        conversationId: execCtx?.conversationId ?? null,
        activeOnly: true,
    })
    if (mine.length === 1) return { taskId: mine[0].id }
    if (mine.length === 0) return { error: '本会话当前没有正在运行的后台任务，请传 taskId。' }
    return {
        error: `本会话有 ${mine.length} 个后台任务在跑（${mine.map(task => task.id).join('、')}），请传 taskId 指定要等哪一个。`,
    }
}

export const createBackgroundTaskTools = (_editor?: unknown): ToolsRecord => ({
    listBackgroundTasks: {
        description:
            '列出本会话的后台任务（长任务：构建、装依赖、发布等以 background: true 启动的工具调用）。'
            + '返回每个任务的 taskId、工具名、标题、状态（running/succeeded/failed/cancelled）、进度与是否有结果。'
            + '要拿某个任务的结果用 getBackgroundTask；不确定还有没有事情在跑时先调它。',
        inputSchema: {
            type: 'object',
            properties: {
                includeFinished: {
                    type: 'boolean',
                    description: '可选。是否包含已结束的任务，默认 true；只想看还在跑的就传 false。',
                },
            },
        },
        readOnly: true,
        execute: async (
            args: { includeFinished?: boolean },
            _callId?: string,
            execCtx?: ToolExecutionContext,
        ) => {
            const tasks = backgroundTasks.list({
                conversationId: execCtx?.conversationId ?? null,
                activeOnly: args?.includeFinished === false,
            })
            if (tasks.length === 0) {
                return {
                    count: 0,
                    tasks: [],
                    hint: '本会话没有后台任务。长任务只有在工具调用带了 background: true 时才会出现。',
                }
            }
            return {
                count: tasks.length,
                running: tasks.filter(task => task.status === 'running').length,
                tasks: tasks.map(summarizeTask),
                hint: tasks.some(task => task.status === 'running')
                    ? '有任务在跑：要等它完成就调 getBackgroundTask({ taskId, wait: true })，也可以先做别的事稍后再查。'
                    : TERMINAL_HINT,
            }
        },
    },

    getBackgroundTask: {
        description:
            '取一个后台任务的状态与结果，wait 为 true 时（默认）会一直等到它结束或超时。'
            + '适用于任何 background: true 启动的长任务：构建、装依赖、发布等。'
            + '返回 status=succeeded 时 result 是那个工具的完整返回值；status=failed 时看 error；'
            + '超时未结束会返回 timedOut: true + 当前进度，你可以继续做别的事，稍后再调一次。'
            + 'taskId 省略时，如果本会话只有一个正在跑的任务就等它。',
        inputSchema: {
            type: 'object',
            properties: {
                taskId: { type: 'string', description: '可选。任务 id（来自后台任务的返回值或 listBackgroundTasks）。' },
                wait: {
                    type: 'boolean',
                    description: '可选。是否等待任务结束，默认 true；传 false 只看当前状态就返回。',
                },
                timeoutMs: {
                    type: 'number',
                    description:
                        `可选。最多等多久（毫秒），默认 ${DEFAULT_BACKGROUND_WAIT_MS}，上限 ${MAX_BACKGROUND_WAIT_MS}（5 分钟）。超时不代表失败。`,
                },
            },
        },
        readOnly: true,
        execute: async (
            args: { taskId?: string; wait?: boolean; timeoutMs?: number },
            _callId?: string,
            execCtx?: ToolExecutionContext,
        ) => {
            const resolved = resolveTaskId(args?.taskId, execCtx)
            if (!resolved.taskId) {
                return {
                    error: resolved.error,
                    tasks: backgroundTasks
                        .list({ conversationId: execCtx?.conversationId ?? null })
                        .map(summarizeTask),
                }
            }
            const before = backgroundTasks.get(resolved.taskId)
            if (args?.wait === false) {
                if (!before) return { error: `没有 taskId 为 "${resolved.taskId}" 的后台任务。` }
                return { ...summarizeTask(before), waited: false }
            }

            const { task, timedOut } = await backgroundTasks.wait(resolved.taskId, args?.timeoutMs)
            if (!task) {
                return { error: `没有 taskId 为 "${resolved.taskId}" 的后台任务。` }
            }
            const summarized = summarizeTask(task)
            if (task.status === 'running') {
                return {
                    ...summarized,
                    timedOut,
                    hint:
                        `等了 ${Math.round((args?.timeoutMs ?? DEFAULT_BACKGROUND_WAIT_MS) / 1000)}s 还没结束（不是失败）。`
                        + '你可以先做别的事，稍后再调一次 getBackgroundTask 继续等；任务完成时系统也会通知你。',
                }
            }
            const { value, truncated } = clipResult(task.result)
            return {
                ...summarized,
                timedOut: false,
                ...(task.status === 'succeeded' ? { result: value } : {}),
                ...(truncated ? { resultTruncated: true } : {}),
                hint:
                    task.status === 'succeeded'
                        ? '任务完成，result 就是那个工具的返回值，按它的 next/hint 继续。'
                        : task.status === 'cancelled'
                            ? '任务已取消（后台动作可能仍在进行，宿主不一定能中断）。'
                            : '任务失败，原因见 error；修好后可以重新调用原来的工具。',
            }
        },
    },

    cancelBackgroundTask: {
        description:
            '取消一个后台任务：不再等它、把它标记为 cancelled，之后它完成也不会再通知你。'
            + '注意这是“停止等待”，不是“杀掉后台动作”——构建/安装本身不可中断，可能仍在进行；'
            + '需要真正停掉开发会话请用 stopPluginProject。',
        inputSchema: {
            type: 'object',
            properties: {
                taskId: { type: 'string', description: '要取消的任务 id；省略时取消本会话唯一的正在运行的任务。' },
            },
        },
        // "Read-only" here means "touches no document" — the only thing it writes
        // is the task board. Saying so explicitly keeps it out of the document
        // write lease and out of the client's mutating-tool gating, where a
        // cancel-behind-a-lock would be nonsense.
        readOnly: true,
        execute: async (
            args: { taskId?: string },
            _callId?: string,
            execCtx?: ToolExecutionContext,
        ) => {
            const resolved = resolveTaskId(args?.taskId, execCtx)
            if (!resolved.taskId) {
                return { error: resolved.error }
            }
            const existing = backgroundTasks.get(resolved.taskId)
            const cancelled = backgroundTasks.cancel(resolved.taskId)
            return {
                ok: cancelled,
                taskId: resolved.taskId,
                ...(cancelled
                    ? {
                        status: 'cancelled',
                        note: '已停止等待。后台动作可能仍在进行，且不会再产生完成通知。',
                    }
                    : { note: `任务不存在或已经结束（当前状态：${existing?.status ?? 'unknown'}）。` }),
            }
        },
    },
})
