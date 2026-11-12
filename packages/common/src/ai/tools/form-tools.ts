/**
 * `requestUserForm` / `getFormRequest` / `listFormRequests` / `cancelFormRequest`
 * — the agent's side of the dynamic-form contract (see
 * `../agent/form-requests.ts`).
 *
 * These are protocol-level tools, not editor tools: asking the user for
 * structured data is not tied to a document (a workbench run with no document is
 * exactly where "发布插件要版本号 + 更新说明 + 是否灰度" happens), so they declare
 * `scope: 'any'` / `requiresEditor: false` in the metadata registry and are
 * registered by core next to the background-task tools.
 *
 * Two rules are easy to get wrong and invisible when wrong:
 *
 * - `requestUserForm` only creates a request where something can RENDER it. The
 *   tool set is shared by every agent surface, so a panel that never mounts the
 *   form UI registers no host; the call fails fast instead of parking the run for
 *   the full wait budget (see `formRequestHostAvailable`).
 * - a session only ever sees ITS OWN requests, unless it names an id explicitly.
 *   The run's `conversationId` comes from the execution context, so one
 *   conversation's form can never be quietly filled by another.
 */

import type { ToolExecutionContext, ToolsRecord } from '../types'
import {
    DEFAULT_FORM_BATCH_MAX_ROWS,
    DEFAULT_FORM_WAIT_MS,
    MAX_FORM_BATCH_ROWS,
    MAX_FORM_WAIT_MS,
    formRequestHostAvailable,
    formRequests,
    normalizeFormRequestInput,
    type FormBatchSpec,
    type FormFieldType,
    type FormRequestView,
} from '../agent/form-requests'

/** The field kinds the schema advertises; mirrors `FormFieldType`. */
const FORM_FIELD_TYPES: FormFieldType[] = [
    'text', 'textarea', 'number', 'select', 'radio', 'multiselect', 'checkbox', 'date',
]

/* ------------------------------------------------------------------ *
 * Model-facing text. Hints are what the model reads instead of the UI, so each
 * one has to say the NEXT step, not just describe the state.
 * ------------------------------------------------------------------ */

const HINT_WAITING = '表单已创建，用户可以在「填写请求」面板里随时填。要等答案就调 getFormRequest({ formId, wait: true })；用户提交后系统会通知你。'
const HINT_ANSWERED = '用户已提交，values 就是填写结果；按它继续原任务。'
const HINT_CANCELLED = '用户取消了填写（没有数据），不要重复追问同样的信息。'
const HINT_TIMEOUT = '用户还没填写（不是失败）。表单在「填写请求」面板里；用户提交后系统会通知你，也可以调 getFormRequest({ formId, wait: true }) 继续等。'
const HINT_PEEK = '表单还在等用户填写；这次只是查看，没有消费任何答案。要等答案就调 getFormRequest({ formId, wait: true })。'
const HINT_CONSUMED = '答案已取到；这张表单不会再通过通知重复投递。'
const HINT_NO_HOST = '当前界面没有挂载「填写请求」面板，无法向用户要数据。请改用普通文字提问让用户回复，或请用户打开带 AI 对话的界面。'
const HINT_NO_HOST_NEXT = '这里没有可用的表单界面；不要重复调用 requestUserForm，直接用文字向用户提问。'

/** A batch spec as the model should see it — the board/view shape lives UI-side. */
const summarizeBatch = (batch: FormBatchSpec) => ({
    minRows: batch.minRows,
    maxRows: batch.maxRows,
    defaultRows: batch.defaultRows,
    ...(batch.rowLabel ? { rowLabel: batch.rowLabel } : {}),
    ...(batch.addLabel ? { addLabel: batch.addLabel } : {}),
})

/** The NEXT step after an answer, phrased for the answer's shape. */
const answeredHint = (request: FormRequestView): string => request.batch
    ? `用户已提交，共 ${request.rows?.length ?? 0} 条记录；rows 就是每条记录的填写结果，按它继续原任务。`
    : HINT_ANSWERED

/** Same, for a read that also consumes the answer (no note will follow). */
const consumedHint = (request: FormRequestView): string => request.batch
    ? `答案已取到（共 ${request.rows?.length ?? 0} 条记录）；这张表单不会再通过通知重复投递。`
    : HINT_CONSUMED

/**
 * Summary shared by `getFormRequest`: single-record answers live in `values`,
 * batch answers in `rows` + `rowCount` (with the batch spec so the model can
 * interpret them).
 */
const summarizeRequest = (request: FormRequestView) => {
    const answered = request.status === 'answered'
    return {
        formId: request.id,
        title: request.title,
        status: request.status,
        createdAt: request.createdAt,
        answeredAt: request.answeredAt ?? null,
        cancelledAt: request.cancelledAt ?? null,
        waitExpired: request.waitExpiredAt !== undefined,
        ...(request.batch ? { batch: summarizeBatch(request.batch) } : {}),
        ...(answered && request.batch && request.rows
            ? { rows: request.rows, rowCount: request.rows.length }
            : {}),
        ...(answered && !request.batch && request.values ? { values: request.values } : {}),
        reason: request.cancelReason ?? null,
    }
}

/** Board row: enough to pick a request, no answer payload (that is get's job). */
const summarizeListEntry = (request: FormRequestView) => ({
    formId: request.id,
    title: request.title,
    status: request.status,
    createdAt: request.createdAt,
    answeredAt: request.answeredAt ?? null,
    cancelledAt: request.cancelledAt ?? null,
    waitExpired: request.waitExpiredAt !== undefined,
    hasAnswers: request.status === 'answered',
    batch: request.batch !== undefined,
    ...(request.status === 'answered' && request.batch && request.rows
        ? { rowCount: request.rows.length }
        : {}),
    conversationId: request.conversationId ?? null,
})

/**
 * The two ways a caller identifies a request: explicitly by id, or "the one I am
 * obviously talking about" — the single pending request of this session.
 */
const resolveFormId = (
    requested: string | undefined,
    execCtx: ToolExecutionContext | undefined,
): { formId?: string; error?: string } => {
    const wanted = typeof requested === 'string' ? requested.trim() : ''
    if (wanted) {
        return formRequests.get(wanted)
            ? { formId: wanted }
            : { error: `没有 formId 为 "${wanted}" 的填写请求。` }
    }
    const mine = formRequests.list({
        conversationId: execCtx?.conversationId ?? null,
        pendingOnly: true,
    })
    if (mine.length === 1) return { formId: mine[0].id }
    if (mine.length === 0) return { error: '本会话当前没有待填写的表单，请传 formId。' }
    return {
        error: `本会话有 ${mine.length} 张待填写的表单（${
            mine.map(request => `${request.id}「${request.title}」`).join('、')
        }），请传 formId 指定要处理哪一张。`,
    }
}

export const createFormTools = (_editor?: unknown, _onUserChoiceRequest?: unknown): ToolsRecord => ({
    requestUserForm: {
        description:
            '向用户要一组结构化数据时用：声明一张动态表单（标题 + 字段），用户填好后一次性拿回 values。'
            + '适合一次需要多个字段的场景（版本号、更新说明、是否灰度……），比连续问多个单选题快得多。'
            + '需要用户一次填多条同类记录时传 batch（批量填写），结果在 rows 数组：answers 里每条记录一个对象。'
            + '默认会等用户填写（最多 timeoutMs，默认 5 分钟）；wait=false 则立即返回，之后可用 getFormRequest 取答案。'
            + '超时不是失败：表单留在「填写请求」面板，用户提交后系统会通知你。'
            + '只放确实需要用户提供的数据字段，能用默认值/常识推断的不要问。',
        inputSchema: {
            type: 'object',
            properties: {
                title: {
                    type: 'string',
                    description: '表单标题，一句话说明要用户填什么，例如“发布插件需要的信息”。',
                },
                description: {
                    type: 'string',
                    description: '可选。表单说明，例如为什么需要这些信息。',
                },
                submitLabel: {
                    type: 'string',
                    description: '可选。提交按钮文案，例如“开始发布”。',
                },
                allowCancel: {
                    type: 'boolean',
                    description: '可选。是否允许用户取消填写，默认 true。',
                },
                fields: {
                    type: 'array',
                    description: '要用户填写的字段（1-20 个）。每个字段有 key/label/type，type 决定控件。',
                    items: {
                        type: 'object',
                        properties: {
                            key: {
                                type: 'string',
                                description: '答案键名，字母/数字/下划线/点/短横线，不以数字开头，例如 "version"。',
                            },
                            label: {
                                type: 'string',
                                description: '显示给用户的字段名，例如“版本号”。',
                            },
                            type: {
                                type: 'string',
                                enum: FORM_FIELD_TYPES,
                                description:
                                    '字段类型：text 单行文本 / textarea 多行文本 / number 数字 / '
                                    + 'select 下拉 / radio 单选 / multiselect 多选 / checkbox 勾选 / date 日期。',
                            },
                            description: {
                                type: 'string',
                                description: '可选。字段下方的说明文字。',
                            },
                            placeholder: {
                                type: 'string',
                                description: '可选。输入框占位提示。',
                            },
                            required: {
                                type: 'boolean',
                                description: '可选。是否必填，默认 false；必填的空值会阻止提交。',
                            },
                            options: {
                                type: 'array',
                                description: 'select / radio / multiselect 的选项（这些类型必填）；也接受纯字符串简写。',
                                items: {
                                    type: 'object',
                                    properties: {
                                        value: { type: 'string', description: '选项值（提交后 values 里就是它）。' },
                                        label: { type: 'string', description: '显示给用户的选项名。' },
                                        description: { type: 'string', description: '可选。选项说明。' },
                                    },
                                    required: ['value', 'label'],
                                },
                            },
                            defaultValue: {
                                description: '可选。初始值，类型与该字段一致（文本用字符串、多选用数组、勾选用布尔）。',
                            },
                            min: { type: 'number', description: '可选。number 字段的最小值。' },
                            max: { type: 'number', description: '可选。number 字段的最大值。' },
                            step: { type: 'number', description: '可选。number 字段的步进（仅 UI 提示）。' },
                            minLength: { type: 'number', description: '可选。文本字段的最少字符数。' },
                            maxLength: { type: 'number', description: '可选。文本字段的最多字符数。' },
                            rows: { type: 'number', description: '可选。textarea 的可见行数（仅 UI 提示）。' },
                        },
                        required: ['key', 'label', 'type'],
                    },
                },
                batch: {
                    description:
                        '可选。批量填写：同一组字段可以重复填多行（每条记录一个对象），结果在 rows 数组。'
                        + '用户一次要录入多条同类数据（成员名单、多个发布项）时用；单条数据不要开。'
                        + `传 true 用默认值（1-${DEFAULT_FORM_BATCH_MAX_ROWS} 条），或传对象自定义行数上下限与文案。`,
                    oneOf: [
                        {
                            type: 'boolean',
                            description: 'true 启用批量（默认 1-20 条），false 或省略为单条表单。',
                        },
                        {
                            type: 'object',
                            properties: {
                                minRows: {
                                    type: 'number',
                                    description: `可选。至少填写几条有效记录，默认 1，上限 ${MAX_FORM_BATCH_ROWS}。`,
                                },
                                maxRows: {
                                    type: 'number',
                                    description:
                                        `可选。最多允许几条记录，默认 ${DEFAULT_FORM_BATCH_MAX_ROWS}，上限 ${MAX_FORM_BATCH_ROWS}。`,
                                },
                                defaultRows: {
                                    type: 'number',
                                    description: '可选。打开时显示几行，默认等于 minRows，会被夹取到 [minRows, maxRows]。',
                                },
                                rowLabel: {
                                    type: 'string',
                                    description: '可选。一条记录的称呼，例如“成员”“条目”“发布项”。',
                                },
                                addLabel: {
                                    type: 'string',
                                    description: '可选。“添加一条”按钮的文案，例如“添加成员”。',
                                },
                            },
                        },
                    ],
                },
                wait: {
                    type: 'boolean',
                    description: '可选。是否等用户填写，默认 true；传 false 立即返回，用户提交后系统会通知你。',
                },
                timeoutMs: {
                    type: 'number',
                    description:
                        `可选。最多等多久（毫秒），默认 ${DEFAULT_FORM_WAIT_MS}，上限 ${MAX_FORM_WAIT_MS}（10 分钟）。超时不代表失败。`,
                },
            },
            required: ['title', 'fields'],
        },
        readOnly: true,
        execute: async (
            args: {
                title?: string
                description?: string
                submitLabel?: string
                allowCancel?: boolean
                fields?: unknown[]
                batch?: unknown
                wait?: boolean
                timeoutMs?: number
            },
            _callId?: string,
            execCtx?: ToolExecutionContext,
        ) => {
            // Fail fast where a form cannot be rendered: parking for five minutes
            // behind an invisible card is worse than being told to ask in text.
            if (!formRequestHostAvailable()) {
                return { error: HINT_NO_HOST, hint: HINT_NO_HOST_NEXT }
            }
            const normalized = normalizeFormRequestInput(args)
            // `in` instead of a discriminant check: this package's check harness
            // compiles without `strict`, where `!normalized.ok` does not narrow.
            if ('error' in normalized) {
                return {
                    error: normalized.error,
                    hint: '表单定义无效，修正字段后重试；只放需要用户填写的数据字段。',
                }
            }
            const request = formRequests.create(normalized.input, {
                conversationId: execCtx?.conversationId ?? null,
                owner: execCtx?.owner ?? null,
                tool: 'requestUserForm',
            })
            if (args?.wait === false) {
                return {
                    status: 'pending',
                    formId: request.id,
                    title: request.title,
                    waiting: false,
                    hint: HINT_WAITING,
                }
            }

            const outcome = await formRequests.wait(request.id, args?.timeoutMs)
            const settled = outcome.request
            if (!settled) {
                return {
                    error: `表单 ${request.id} 已不存在（可能已被重置）。`,
                    hint: '需要用户数据就重新调用 requestUserForm。',
                }
            }
            if (settled.status === 'answered') {
                if (settled.batch) {
                    const rows = settled.rows ?? []
                    return {
                        status: 'answered',
                        formId: settled.id,
                        title: settled.title,
                        rows,
                        rowCount: rows.length,
                        answeredAt: settled.answeredAt ?? null,
                        hint: `用户已提交，共 ${rows.length} 条记录；rows 就是每条记录的填写结果，按它继续原任务。`,
                    }
                }
                return {
                    status: 'answered',
                    formId: settled.id,
                    title: settled.title,
                    values: settled.values ?? {},
                    answeredAt: settled.answeredAt ?? null,
                    hint: HINT_ANSWERED,
                }
            }
            if (settled.status === 'cancelled') {
                return {
                    status: 'cancelled',
                    formId: settled.id,
                    title: settled.title,
                    reason: settled.cancelReason ?? null,
                    hint: HINT_CANCELLED,
                }
            }
            return {
                status: 'pending',
                formId: settled.id,
                title: settled.title,
                timedOut: true,
                hint: HINT_TIMEOUT,
            }
        },
    },

    getFormRequest: {
        description:
            '取一张填写请求的状态与答案；wait 为 true 时（默认）会等到用户提交、取消或超时。'
            + '返回 status=answered 时：单条表单的 values 是填写结果；批量表单（batch）的 rows 是每条记录一个对象，另带 rowCount。'
            + 'status=pending 说明用户还没填（超时会带 timedOut: true），'
            + '表单仍在「填写请求」面板里，可以稍后再调一次。'
            + 'formId 省略时，如果本会话只有一张待填写的表单就取它。'
            + 'wait=false 只看当前状态并消费已完成的答案（之后不会再收到重复通知）。',
        inputSchema: {
            type: 'object',
            properties: {
                formId: {
                    type: 'string',
                    description: '可选。填写请求的 id（来自 requestUserForm 的返回值或 listFormRequests）。',
                },
                wait: {
                    type: 'boolean',
                    description: '可选。是否等用户处理，默认 true；传 false 只看当前状态就返回。',
                },
                timeoutMs: {
                    type: 'number',
                    description:
                        `可选。最多等多久（毫秒），默认 ${DEFAULT_FORM_WAIT_MS}，上限 ${MAX_FORM_WAIT_MS}（10 分钟）。超时不代表失败。`,
                },
            },
        },
        readOnly: true,
        execute: async (
            args: { formId?: string; wait?: boolean; timeoutMs?: number },
            _callId?: string,
            execCtx?: ToolExecutionContext,
        ) => {
            const resolved = resolveFormId(args?.formId, execCtx)
            if (!resolved.formId) {
                return {
                    error: resolved.error,
                    forms: formRequests
                        .list({ conversationId: execCtx?.conversationId ?? null })
                        .map(summarizeListEntry),
                }
            }
            const formId = resolved.formId

            if (args?.wait === false) {
                const viewed = formRequests.consume(formId)
                if (!viewed) return { error: `没有 formId 为 "${formId}" 的填写请求。` }
                return {
                    ...summarizeRequest(viewed),
                    hint: viewed.status === 'answered'
                        ? consumedHint(viewed)
                        : viewed.status === 'cancelled'
                            ? HINT_CANCELLED
                            : HINT_PEEK,
                }
            }

            const outcome = await formRequests.wait(formId, args?.timeoutMs)
            const settled = outcome.request
            if (!settled) return { error: `没有 formId 为 "${formId}" 的填写请求。` }
            if (settled.status === 'answered') {
                return { ...summarizeRequest(settled), hint: answeredHint(settled) }
            }
            if (settled.status === 'cancelled') {
                return { ...summarizeRequest(settled), hint: HINT_CANCELLED }
            }
            return { ...summarizeRequest(settled), timedOut: true, hint: HINT_TIMEOUT }
        },
    },

    listFormRequests: {
        description:
            '列出本会话的填写请求（requestUserForm 创建的表单）及其状态：pending 待填写 / answered 已填写 / cancelled 已取消。'
            + '返回概要（formId、标题、状态、时间、是否有答案；批量表单标 batch，已填写的批量表单另带 rowCount），'
            + '不含完整 values/rows；要取某张表单的答案用 getFormRequest。'
            + '用户可以在「填写请求」面板里跨会话查看这些表单。',
        inputSchema: {
            type: 'object',
            properties: {
                includeFinished: {
                    type: 'boolean',
                    description: '可选。是否包含已结束（已填写/已取消）的表单，默认 true；只看待填写的传 false。',
                },
            },
        },
        readOnly: true,
        execute: async (
            args: { includeFinished?: boolean },
            _callId?: string,
            execCtx?: ToolExecutionContext,
        ) => {
            const requests = formRequests.list({
                conversationId: execCtx?.conversationId ?? null,
                pendingOnly: args?.includeFinished === false,
            })
            return {
                count: requests.length,
                pending: requests.filter(request => request.status === 'pending').length,
                requests: requests.map(summarizeListEntry),
                hint: requests.length === 0
                    ? '本会话没有填写请求。需要用户提供数据时用 requestUserForm 创建一张表单。'
                    : '这里只有概要（批量表单标 batch，已填写带 rowCount）；要取完整的 values/rows 用 getFormRequest({ formId })。',
            }
        },
    },

    cancelFormRequest: {
        description:
            '取消一张待填写的表单（用户不用再填，正在等它的 run 会收到 status=cancelled）。'
            + '只用于“不需要这些数据了”；用户在「填写请求」面板里自己也能取消。已填写/已取消的表单不能再次取消。',
        inputSchema: {
            type: 'object',
            properties: {
                formId: { type: 'string', description: '要取消的表单 id；省略时取消本会话唯一的待填写表单。' },
                reason: { type: 'string', description: '可选。取消原因（记录给用户看），默认“用户取消了填写”。' },
            },
        },
        readOnly: true,
        execute: async (
            args: { formId?: string; reason?: string },
            _callId?: string,
            execCtx?: ToolExecutionContext,
        ) => {
            const explicit = typeof args?.formId === 'string' ? args.formId.trim() : ''
            let formId = explicit
            if (!formId) {
                const resolved = resolveFormId(undefined, execCtx)
                if (!resolved.formId) return { ok: false, note: resolved.error }
                formId = resolved.formId
            }
            const reason = typeof args?.reason === 'string' ? args.reason.trim() : ''
            const cancelled = formRequests.cancel(formId, reason || undefined)
            return cancelled
                ? {
                    ok: true,
                    formId,
                    status: 'cancelled',
                    note: '已取消；如果 agent 正在等这张表单，会收到 status=cancelled。',
                }
                : { ok: false, note: '不存在或已处理' }
        },
    },
})