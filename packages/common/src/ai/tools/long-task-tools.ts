/**
 * `listLongTasks` / `getLongTask` / `getLongTaskLogs` / `cancelLongTask` — the
 * agent's side of the plugin long-task contract (`desktop.tasks`, see
 * `docs/LONG_TASKS.md`).
 *
 * These are protocol-level tools, not editor tools: a plugin task (sync,
 * transcode, install, batch job) is not tied to a document and can be waiting in
 * a workbench run with no editor at all. They therefore declare
 * `scope: 'any'` / `requiresEditor: false` in the metadata registry and are
 * registered by core next to the background-task tools.
 *
 * Two facts shape the tools:
 *
 *   - the authoritative log read is `logsSince` (cursor), never the event stream:
 *     events may be dropped, the `seq` cursor may not. The tools expose
 *     `nextSeq` and tell the model to poll with it.
 *   - `cancel` is COOPERATIVE. The host broadcasts `cancel-request`; it never
 *     kills the plugin's work. The result says so explicitly, because a model
 *     that believes it killed a process will not verify that it actually stopped.
 *
 * Hosts without `desktop.tasks` (web build, older desktop) get one stable error
 * sentence per tool instead of a thrown IPC error, so the model can route around
 * it (e.g. with `background: true` tools) instead of retrying.
 */

import type { ToolExecutionContext, ToolsRecord } from '../types'
import type {
    DesktopTaskLogsPage,
    DesktopTaskSnapshot,
    DesktopTaskState,
    TaskBridge,
} from '../../core/desktop/tasks'
import { resolveOptionalService } from '../../services/service-resolver'

/** Default `getLongTask({ wait })` budget. */
export const DEFAULT_LONG_TASK_WAIT_MS = 60_000
/**
 * Maximum wait. Deliberately below the client tool deadline (90s) so a task
 * that finishes near the deadline still resolves as a result rather than as a
 * cut-off tool call.
 */
export const MAX_LONG_TASK_WAIT_MS = 80_000

const MAX_LOG_LINES = 200
const MAX_RESULT_CHARS = 800
const UNSUPPORTED_ERROR = '当前宿主不支持插件长任务（desktop.tasks 不可用）'
const CANCEL_NOTE = '取消是协作式的，宿主不会杀进程；任务可能继续到插件自己停止'

export interface LongTaskToolDeps {
    /**
     * Bridge override (tests / hosts that do not register the `desktop` service).
     * Defaults to the registered `desktop.tasks`.
     */
    getBridge?: () => TaskBridge | undefined
}

const messageOf = (error: unknown): string =>
    error instanceof Error ? error.message : String(error)

const isTerminal = (state: DesktopTaskState): boolean =>
    state === 'succeeded' || state === 'failed' || state === 'cancelled'

const normalizeTaskId = (value: unknown): string =>
    typeof value === 'string' ? value.trim() : ''

const unknownTaskError = (taskId: string): string =>
    `没有 taskId 为 "${taskId}" 的插件长任务（可能从未注册、已结束并被移除，或已被宿主淘汰）。可用 listLongTasks 查看当前任务。`

/** Serialize a result for the model; over-long values are clipped, not dropped. */
const serializeResult = (value: unknown): { text: string; truncated: boolean } => {
    let text: string
    try {
        text = typeof value === 'string' ? value : JSON.stringify(value) ?? String(value)
    } catch {
        text = String(value)
    }
    return text.length > MAX_RESULT_CHARS
        ? { text: `${text.slice(0, MAX_RESULT_CHARS)}…`, truncated: true }
        : { text, truncated: false }
}

/** Compact listing entry: enough to choose a task, not the whole result. */
const summarizeTask = (task: DesktopTaskSnapshot) => {
    const hasResult = task.result !== undefined
    const result = hasResult ? serializeResult(task.result) : undefined
    return {
        taskId: task.id,
        title: task.title,
        kind: task.kind,
        state: task.state,
        progress: task.progress,
        updatedAt: task.updatedAt,
        ...(task.error === undefined ? {} : { error: task.error }),
        hasResult,
        ...(result === undefined
            ? {}
            : result.truncated
              ? { result: result.text, resultTruncated: true }
              : { result: task.result }),
    }
}

/**
 * Wait for one task to reach a terminal state, by subscribing FIRST and then
 * reading — the other order can miss a finish that lands between the read and
 * the subscription.
 *
 * A timeout is not a failure: it resolves with `timedOut: true` and the freshest
 * snapshot the caller managed to see.
 */
const waitForTerminal = (
    bridge: TaskBridge,
    taskId: string,
    timeoutMs: number,
): Promise<{ task: DesktopTaskSnapshot | null; timedOut: boolean }> =>
    new Promise((resolve) => {
        let settled = false
        let latest: DesktopTaskSnapshot | null = null
        let timer: ReturnType<typeof setTimeout> | undefined
        let unsubscribe: () => void = () => {}

        const settle = (task: DesktopTaskSnapshot | null, timedOut: boolean): void => {
            if (settled) return
            settled = true
            if (timer !== undefined) clearTimeout(timer)
            unsubscribe()
            resolve({ task, timedOut })
        }

        try {
            if (typeof bridge.onEvent === 'function') {
                unsubscribe = bridge.onEvent((event) => {
                    if (event.task.id !== taskId) return
                    latest = event.task
                    if (isTerminal(event.task.state)) settle(event.task, false)
                })
            }
        } catch {
            // Fall back to the one-shot read below plus the timeout.
        }

        timer = setTimeout(() => {
            if (settled) return
            // Re-read once: the last event may be older than the terminal state.
            void bridge
                .get({ taskId })
                .then((next) => settle(next ?? latest, true))
                .catch(() => settle(latest, true))
        }, timeoutMs)

        void bridge
            .get({ taskId })
            .then((next) => {
                if (!next) return
                latest = next
                if (isTerminal(next.state)) settle(next, false)
            })
            .catch(() => {
                // The timeout path reports what we have.
            })
    })

const clampWait = (value: unknown): number => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return DEFAULT_LONG_TASK_WAIT_MS
    return Math.min(Math.floor(value), MAX_LONG_TASK_WAIT_MS)
}

/**
 * Build the long-task tools.
 *
 * The factory shape is what lets the check drive them directly with an
 * in-memory bridge (`createLongTaskTools({ getBridge: () => host.bridge })`).
 */
export const createLongTaskTools = (deps: LongTaskToolDeps = {}): ToolsRecord => {
    const resolveBridge = (): TaskBridge | undefined =>
        deps.getBridge ? deps.getBridge() : resolveOptionalService('desktop')?.tasks

    const unsupported = () => ({ error: UNSUPPORTED_ERROR })

    const readTask = async (bridge: TaskBridge, taskId: string): Promise<DesktopTaskSnapshot | null> => {
        try {
            return await bridge.get({ taskId })
        } catch {
            return null
        }
    }

    return {
        listLongTasks: {
            description:
                '列出插件在宿主注册的长任务（desktop.tasks：插件自己的同步、转码、批量处理、安装等）。'
                + '返回每个任务的 taskId、标题、kind、状态（running/cancelling/succeeded/failed/cancelled）、进度、'
                + '是否有结果（hasResult）以及截断到约 800 字的结果。'
                + '要等某个任务结束用 getLongTask；要看它的日志用 getLongTaskLogs。',
            inputSchema: {
                type: 'object',
                properties: {
                    state: {
                        type: 'string',
                        enum: ['running', 'cancelling', 'succeeded', 'failed', 'cancelled'],
                        description: '可选。只看某个状态，例如 running。',
                    },
                    kind: { type: 'string', description: '可选。按 kind 精确过滤（如 sync）。' },
                    root: { type: 'string', description: '可选。按工程根目录精确过滤。' },
                    limit: {
                        type: 'number',
                        description: '可选。最多返回多少个（默认由宿主决定，通常 100，宿主上限 500）。',
                    },
                },
            },
            readOnly: true,
            execute: async (args: { state?: DesktopTaskState; kind?: string; root?: string; limit?: number } = {}) => {
                const bridge = resolveBridge()
                if (!bridge) return unsupported()
                try {
                    const tasks = await bridge.list({
                        ...(args?.state === undefined ? {} : { state: args.state }),
                        ...(args?.kind === undefined ? {} : { kind: args.kind }),
                        ...(args?.root === undefined ? {} : { root: args.root }),
                        ...(typeof args?.limit === 'number' ? { limit: args.limit } : {}),
                    })
                    return {
                        count: tasks.length,
                        tasks: tasks.map(summarizeTask),
                        ...(tasks.length === 0
                            ? { hint: '当前宿主上没有插件长任务。任务由插件通过 @kn/common 的 startLongTask/runLongTask 注册。' }
                            : {}),
                    }
                } catch (error) {
                    return { error: messageOf(error) }
                }
            },
        },

        getLongTask: {
            description:
                '取一个插件长任务的状态与结果；wait 为 true（默认）时等到它到达终态或超时。'
                + '返回 timedOut=false 时，state 是终态；succeeded 时 result 是插件保存的结构化结果。'
                + '超时会返回 timedOut=true + 当前快照（不是错误），可以先做别的事稍后再调。',
            inputSchema: {
                type: 'object',
                properties: {
                    taskId: { type: 'string', description: '任务 id（来自 listLongTasks 或插件的返回值）。' },
                    wait: {
                        type: 'boolean',
                        description: '可选。是否等任务结束，默认 true；传 false 只看当前状态就返回。',
                    },
                    timeoutMs: {
                        type: 'number',
                        description: `可选。最多等多久（毫秒），默认 ${DEFAULT_LONG_TASK_WAIT_MS}，上限 ${MAX_LONG_TASK_WAIT_MS}（超时不是失败）。`,
                    },
                },
                required: ['taskId'],
            },
            readOnly: true,
            execute: async (
                args: { taskId?: string; wait?: boolean; timeoutMs?: number },
                _callId?: string,
                _execCtx?: ToolExecutionContext,
            ) => {
                const bridge = resolveBridge()
                if (!bridge) return unsupported()
                const taskId = normalizeTaskId(args?.taskId)
                if (!taskId) return { error: '请传入 taskId（来自 listLongTasks 或插件 startLongTask 的返回值）。' }

                const initial = await readTask(bridge, taskId)
                if (!initial) return { error: unknownTaskError(taskId) }
                if (args?.wait === false) {
                    return { timedOut: false, task: summarizeTask(initial) }
                }
                if (isTerminal(initial.state)) {
                    return { timedOut: false, task: summarizeTask(initial) }
                }

                const { task, timedOut } = await waitForTerminal(bridge, taskId, clampWait(args?.timeoutMs))
                if (!task) return { error: unknownTaskError(taskId) }
                if (timedOut) {
                    return {
                        timedOut: true,
                        task: summarizeTask(task),
                        hint: `等了 ${Math.round(clampWait(args?.timeoutMs) / 1000)}s 任务还没结束（不是失败）。`
                            + '可以先做别的事，稍后再调 getLongTask 继续等；日志用 getLongTaskLogs 轮询。',
                    }
                }
                return { timedOut: false, task: summarizeTask(task) }
            },
        },

        getLongTaskLogs: {
            description:
                '增量读取插件长任务的日志（跟 dev.logsSince 同形的 seq 游标）。'
                + '只返回 seq > sinceSeq 的行，最多 200 条；返回的 nextSeq 就是下一次轮询要传的 sinceSeq。'
                + 'grep 是大小写不敏感的客户端过滤，level 按 info/warn/error 过滤。'
                + 'dropped > 0 表示有行已不在宿主 ring 里（被淘汰或本次 limit 截断），不要当完整历史。',
            inputSchema: {
                type: 'object',
                properties: {
                    taskId: { type: 'string', description: '任务 id。' },
                    sinceSeq: {
                        type: 'number',
                        description: '可选。只取 seq 大于它的行；上一次返回的 nextSeq 直接传进来即可。',
                    },
                    limit: { type: 'number', description: `可选。最多返回多少行（默认/上限 ${MAX_LOG_LINES}）。` },
                    level: {
                        type: 'string',
                        enum: ['info', 'warn', 'error'],
                        description: '可选。只看某个级别。',
                    },
                    grep: { type: 'string', description: '可选。按子串过滤（大小写不敏感）。' },
                },
                required: ['taskId'],
            },
            readOnly: true,
            execute: async (
                args: { taskId?: string; sinceSeq?: number; limit?: number; level?: string; grep?: string },
                _callId?: string,
                _execCtx?: ToolExecutionContext,
            ) => {
                const bridge = resolveBridge()
                if (!bridge) return unsupported()
                const taskId = normalizeTaskId(args?.taskId)
                if (!taskId) return { error: '请传入 taskId。' }

                const sinceSeq =
                    typeof args?.sinceSeq === 'number' && Number.isFinite(args.sinceSeq) && args.sinceSeq > 0
                        ? Math.floor(args.sinceSeq)
                        : 0
                const requested = typeof args?.limit === 'number' && Number.isFinite(args.limit) && args.limit > 0
                    ? Math.floor(args.limit)
                    : MAX_LOG_LINES
                const limit = Math.min(Math.max(1, requested), MAX_LOG_LINES)
                const level =
                    args?.level === 'info' || args?.level === 'warn' || args?.level === 'error'
                        ? args.level
                        : undefined
                const grep = typeof args?.grep === 'string' ? args.grep.trim().toLowerCase() : ''

                let page: DesktopTaskLogsPage
                try {
                    page = await bridge.logsSince({ taskId, sinceSeq, limit })
                } catch (error) {
                    return { error: messageOf(error) }
                }
                if (page.sessionId === null) {
                    return { error: `没有 taskId 为 "${taskId}" 的插件长任务（或它的日志已随任务移除）。` }
                }

                const lines = page.entries
                    .filter(entry => (level === undefined ? true : entry.level === level))
                    .filter(entry => (grep ? entry.message.toLowerCase().includes(grep) : true))
                    .map(entry => ({ seq: entry.seq, level: entry.level, message: entry.message, at: entry.at }))

                return {
                    taskId,
                    sessionId: page.sessionId,
                    nextSeq: page.nextSeq,
                    dropped: page.dropped,
                    total: page.total,
                    lines,
                    hint:
                        `轮询时把 sinceSeq 传成 nextSeq=${page.nextSeq}，只读新增行。`
                        + (page.dropped > 0
                            ? ` dropped=${page.dropped}：有行已不在宿主 ring 里（淘汰或截断），不要当完整历史。`
                            : '')
                        + (lines.length === 0 && page.entries.length > 0
                            ? ' 本次没有匹配 grep/level 的行。'
                            : ''),
                }
            },
        },

        cancelLongTask: {
            description:
                '请求取消一个插件长任务：宿主把状态标为 cancelling 并广播 cancel-request，插件应在自己的循环里检查 AbortSignal 后停止。'
                + '注意这是协作式的：宿主不会杀进程，任务可能继续到插件自己停止为止；取消后要重新查状态确认真正结束。',
            inputSchema: {
                type: 'object',
                properties: {
                    taskId: { type: 'string', description: '要取消的任务 id。' },
                },
                required: ['taskId'],
            },
            // "Read-only" here means "touches no document" — the only thing it
            // writes is the host task state.
            readOnly: true,
            execute: async (args: { taskId?: string }, _callId?: string, _execCtx?: ToolExecutionContext) => {
                const bridge = resolveBridge()
                if (!bridge) return unsupported()
                const taskId = normalizeTaskId(args?.taskId)
                if (!taskId) return { error: '请传入 taskId。' }
                try {
                    const result = await bridge.cancel({ taskId })
                    return {
                        ok: result.cancelRequested,
                        state: result.state,
                        cancelRequested: result.cancelRequested,
                        note: CANCEL_NOTE,
                        ...(result.cancelRequested
                            ? {}
                            : { hint: `任务已经是终态（${result.state}），没有可取消的工作。` }),
                    }
                } catch (error) {
                    return { error: messageOf(error), note: CANCEL_NOTE }
                }
            },
        },
    }
}