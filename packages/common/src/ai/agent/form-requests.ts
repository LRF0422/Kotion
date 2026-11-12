/**
 * Dynamic forms — the agent asks the user for structured data at runtime.
 *
 * ## Why this exists
 *
 * `askUserChoice` covers "pick one of two options". A lot of agent work needs
 * more than one answer ("发布插件要版本号 + 更新说明 + 是否灰度"), and modelling
 * that as a chain of single-choice questions is slow for the user and lossy for
 * the model. So a tool can declare a WHOLE form — fields, types, validation —
 * in one call. The schema is data, not code: the model picks the fields at run
 * time and the host renders them.
 *
 * ## Lifecycle and the two delivery paths
 *
 * A request is `pending` → `answered` | `cancelled`:
 *
 *   - `requestUserForm` creates it in the process-wide registry and (by default)
 *     parks until the user submits or the wait budget expires.
 *   - The user can answer it from the conversation card **or from the unified
 *     "填写请求" board** in the chat header. The board is the point: a form does
 *     not have to be filled in the conversation that asked, and the request has
 *     a single place to live while it waits.
 *   - If the wait budget expires, the request STAYS pending. The user can fill it
 *     later ("方便用户在需要时填数据"), the tool returns `status: 'pending'`, and
 *     the answer is then delivered to the conversation exactly once as a note
 *     (see below). `getFormRequest({ wait: true })` is how the agent parks again.
 *
 * Exactly one of these consumes an answer:
 *
 *   1. a waiter was parked on the request when the user submitted — the tool
 *      result carries the values, and the request is marked delivered;
 *   2. nobody was waiting (the wait expired, or the run moved on) — the request
 *      stays "answered, undelivered" until the host claims it with
 *      {@link FormRequestRegistry.takeUndelivered} (the same first-idle pattern
 *      background tasks use), then injects a note into the conversation.
 *
 * `deliveredAt` is what makes that exactly-once: a peek at a PENDING request
 * consumes nothing, and a consumed answer is never announced twice.
 *
 * ## What is deliberately NOT promised
 *
 * - **The registry is per JS context and in-memory.** A page reload drops
 *   pending requests (and the run that was parked on one is gone anyway). The
 *   host's own session state is the truth after a reload.
 * - **No conditional fields, no file uploads.** The field kinds are the plain
 *   data types below; `pattern` (regex from the model) is deliberately not
 *   supported — a hostile/accidental regex must not be able to hang the UI.
 * - **One form per step is the intended usage.** Tool batches execute in order,
 *   so two blocking `requestUserForm` calls in one step would serialize; put the
 *   fields in one form instead.
 */

/** Field kinds a dynamic form can declare. */
export type FormFieldType =
    | 'text'
    | 'textarea'
    | 'number'
    | 'select'
    | 'radio'
    | 'multiselect'
    | 'checkbox'
    | 'date'

/** One option of a `select` / `radio` / `multiselect` field. */
export interface FormFieldOption {
    value: string
    label: string
    description?: string
}

/** One answer value. `null` is only used by a cleared optional field. */
export type FormFieldValue = string | number | boolean | string[] | null

/** Submitted answers, keyed by field `key`. */
export type FormValues = Record<string, FormFieldValue>

/** One field of a dynamic form. */
export interface FormField {
    /** Stable answer key; must match `^[A-Za-z_][A-Za-z0-9_.-]*$`. */
    key: string
    /** Human label shown above the control. */
    label: string
    type: FormFieldType
    /** Helper text under the label. */
    description?: string
    placeholder?: string
    /** Required fields block submission until they have a value. */
    required?: boolean
    /** Choices for `select` / `radio` / `multiselect` (required for those kinds). */
    options?: FormFieldOption[]
    /** Initial value, if the form should open pre-filled. */
    defaultValue?: FormFieldValue
    /** `number` bounds. */
    min?: number
    max?: number
    /** `number` UI step (a hint; not part of validation). */
    step?: number
    /** `text` / `textarea` length bounds. */
    minLength?: number
    maxLength?: number
    /** `textarea` visible rows (a hint). */
    rows?: number
}

/**
 * Batch mode: the SAME field set is repeated per record, so the user fills several
 * rows in one interaction (批量填写). The answer lives in
 * {@link FormRequestView.rows}; empty rows are ignored on submit.
 */
export interface FormBatchSpec {
    /** Minimum number of non-empty records required to submit. */
    minRows: number
    /** Maximum number of records the editor lets the user create. */
    maxRows: number
    /** Rows the form opens with (clamped to [minRows, maxRows]). */
    defaultRows: number
    /** Noun for one record in the UI, e.g. 条目 / 成员 / 发布项. */
    rowLabel?: string
    /** Label of the "add a record" button, e.g. 添加一条. */
    addLabel?: string
}

/** Default/maximum batch rows. Kept small: this is a question card, not a grid. */
export const DEFAULT_FORM_BATCH_MAX_ROWS = 20
export const MAX_FORM_BATCH_ROWS = 50

/** A normalized form definition — what the registry stores and the UI renders. */
export interface FormRequestInput {
    title: string
    description?: string
    submitLabel?: string
    fields: FormField[]
    /** Whether the user may dismiss the form without answering. Default true. */
    allowCancel?: boolean
    /** Present when the user should fill several records of the same fields. */
    batch?: FormBatchSpec
}

/** Terminal states are `answered` / `cancelled`. */
export type FormRequestStatus = 'pending' | 'answered' | 'cancelled'

/** A form request as seen from outside (UI, tools, notifications). */
export interface FormRequestView {
    /** `form-1`, … unique within this JS context. */
    id: string
    title: string
    description?: string
    submitLabel?: string
    fields: FormField[]
    allowCancel: boolean
    status: FormRequestStatus
    createdAt: number
    answeredAt?: number
    cancelledAt?: number
    /** Validated answers for a SINGLE-record form, present once answered. */
    values?: FormValues
    /** Validated records for a BATCH form, present once answered. */
    rows?: FormValues[]
    /** Present when this form was declared in batch mode. */
    batch?: FormBatchSpec
    /** Conversation that asked; answer notes never cross conversations. */
    conversationId?: string | null
    /** Delegated sub-run id, or null for the main agent. */
    owner?: string | null
    /** Tool that created the request (diagnostics). */
    tool?: string
    /** Set when the agent has been shown the answer (waiter or note). */
    deliveredAt?: number
    /**
     * When the tool's wait budget expired. The request is still fillable; this
     * is what tells the UI/agent "nobody is parked on it any more".
     */
    waitExpiredAt?: number
    /** Why the request was cancelled (user dismissal / agent withdrawal). */
    cancelReason?: string
    meta?: Record<string, unknown>
}

export type FormRequestEvent =
    | { type: 'created'; request: FormRequestView }
    | { type: 'answered'; request: FormRequestView }
    | { type: 'cancelled'; request: FormRequestView }

/** An event, or `undefined` for a change that is not a lifecycle transition. */
export type FormRequestListener = (event?: FormRequestEvent) => void

export type FormSubmitResult =
    | { ok: true; request: FormRequestView }
    | { ok: false; error: string; fieldErrors?: Record<string, string> }

export interface FormWaitOutcome {
    request: FormRequestView | undefined
    timedOut: boolean
}

/** Bounds. Kept small on purpose: this is a question card, not a form builder. */
export const MAX_FORM_FIELDS = 20
export const MAX_FORM_OPTIONS = 50
export const MAX_FORM_TITLE_CHARS = 120
export const MAX_FORM_DESCRIPTION_CHARS = 2_000
export const MAX_FORM_FIELD_LABEL_CHARS = 200
export const MAX_FORM_FIELD_DESCRIPTION_CHARS = 500
export const MAX_FORM_OPTION_LABEL_CHARS = 120
export const MAX_FORM_TEXT_LENGTH = 10_000
/** Default/maximum wait for `requestUserForm` / `getFormRequest`, in ms. */
export const DEFAULT_FORM_WAIT_MS = 300_000
export const MAX_FORM_WAIT_MS = 600_000
export const MIN_FORM_WAIT_MS = 1_000
/** Terminal requests kept in memory (oldest terminal entries are dropped first). */
const MAX_FORM_REQUESTS = 100

const FIELD_TYPES: ReadonlySet<string> = new Set<FormFieldType>([
    'text', 'textarea', 'number', 'select', 'radio', 'multiselect', 'checkbox', 'date',
])

const FIELD_KEY_RE = /^[A-Za-z_][A-Za-z0-9_.-]{0,63}$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value)

const isFiniteNumber = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value)

const text = (value: unknown): string | undefined =>
    typeof value === 'string' ? value.trim() : undefined

const clampInteger = (value: number, min: number, max: number): number =>
    Math.max(min, Math.min(max, Math.floor(value)))

/** Wait budgets are clamped, never trusted: a model may pass anything. */
export const clampFormWaitMs = (timeoutMs?: number): number => {
    const raw = isFiniteNumber(timeoutMs) ? timeoutMs : DEFAULT_FORM_WAIT_MS
    return clampInteger(raw, 0, MAX_FORM_WAIT_MS)
}

/** True when a request still needs the user. */
export const isFormRequestPending = (request: FormRequestView): boolean => request.status === 'pending'

const statusText = (status: FormRequestStatus): string =>
    status === 'answered' ? '已填写' : status === 'cancelled' ? '已取消' : '待填写'

/* ------------------------------------------------------------------ *
 * Normalization
 *
 * The model's raw arguments are untrusted: keys may be missing/duplicated,
 * options may be plain strings, a number may be a string, bounds may be absurd.
 * Normalize once, at the tool boundary, and let everything downstream (registry,
 * UI, validator) work with a trustworthy shape.
 * ------------------------------------------------------------------ */

export type NormalizeFormResult =
    | { ok: true; input: FormRequestInput }
    | { ok: false; error: string }

const normalizeOptions = (
    raw: unknown,
    fieldLabel: string,
): { ok: true; options: FormFieldOption[] } | { ok: false; error: string } => {
    if (!Array.isArray(raw) || raw.length === 0) {
        return { ok: false, error: `字段「${fieldLabel}」需要至少一个选项。` }
    }
    if (raw.length > MAX_FORM_OPTIONS) {
        return { ok: false, error: `字段「${fieldLabel}」的选项不能超过 ${MAX_FORM_OPTIONS} 个。` }
    }
    const options: FormFieldOption[] = []
    const seen = new Set<string>()
    for (const entry of raw) {
        // A plain string is the obvious shorthand a model reaches for
        // (`options: ["免费版", "专业版"]`); accepting it is cheaper than failing.
        if (typeof entry === 'string') {
            const value = entry.trim()
            if (!value) return { ok: false, error: `字段「${fieldLabel}」有一个空选项。` }
            if (seen.has(value)) return { ok: false, error: `字段「${fieldLabel}」的选项「${value}」重复。` }
            seen.add(value)
            options.push({ value, label: value })
            continue
        }
        if (!isRecord(entry)) {
            return { ok: false, error: `字段「${fieldLabel}」的选项必须是字符串或 { value, label } 对象。` }
        }
        const value = text(entry.value)
        const label = text(entry.label) ?? value
        const description = text(entry.description)
        if (!value) return { ok: false, error: `字段「${fieldLabel}」有一个选项缺少 value。` }
        if (!label) return { ok: false, error: `字段「${fieldLabel}」的选项「${value}」缺少 label。` }
        if (value.length > MAX_FORM_OPTION_LABEL_CHARS) {
            return { ok: false, error: `字段「${fieldLabel}」的选项值过长。` }
        }
        if (label.length > MAX_FORM_OPTION_LABEL_CHARS) {
            return { ok: false, error: `字段「${fieldLabel}」的选项名过长。` }
        }
        if (seen.has(value)) return { ok: false, error: `字段「${fieldLabel}」的选项「${value}」重复。` }
        seen.add(value)
        options.push({
            value,
            label,
            ...(description ? { description: description.slice(0, MAX_FORM_FIELD_DESCRIPTION_CHARS) } : {}),
        })
    }
    return { ok: true, options }
}

const normalizeDefaultValue = (field: FormField): FormFieldValue | undefined => {
    const raw = field.defaultValue
    if (raw === undefined) return undefined
    switch (field.type) {
        case 'text':
        case 'textarea': {
            if (typeof raw !== 'string') return undefined
            const capped = raw.slice(0, field.maxLength ?? MAX_FORM_TEXT_LENGTH)
            if (field.required && !capped.trim()) return undefined
            if (typeof field.minLength === 'number' && capped.length < field.minLength) return undefined
            return capped
        }
        case 'number':
            if (!isFiniteNumber(raw)) return undefined
            if (typeof field.min === 'number' && raw < field.min) return undefined
            if (typeof field.max === 'number' && raw > field.max) return undefined
            return raw
        case 'checkbox':
            return typeof raw === 'boolean' ? raw : undefined
        case 'date':
            return typeof raw === 'string' && isRealDate(raw) ? raw : undefined
        case 'select':
        case 'radio':
            return typeof raw === 'string' && field.options?.some(option => option.value === raw)
                ? raw
                : undefined
        case 'multiselect': {
            if (!Array.isArray(raw)) return undefined
            const allowed = new Set((field.options ?? []).map(option => option.value))
            const values = Array.from(new Set(raw.filter((item): item is string => (
                typeof item === 'string' && allowed.has(item)
            ))))
            return values
        }
        default:
            return undefined
    }
}

const normalizeField = (
    raw: unknown,
    index: number,
    seenKeys: Set<string>,
): { ok: true; field: FormField } | { ok: false; error: string } => {
    if (!isRecord(raw)) return { ok: false, error: `第 ${index + 1} 个字段必须是对象。` }

    const rawKey = text(raw.key)
    const rawLabel = text(raw.label)
    const rawType = text(raw.type) ?? 'text'
    const label = rawLabel ?? rawKey
    if (!rawKey) return { ok: false, error: `第 ${index + 1} 个字段缺少 key。` }
    if (!FIELD_KEY_RE.test(rawKey)) {
        return { ok: false, error: `字段 key「${rawKey}」不合法（字母/数字/下划线/点/短横线，且不以数字开头）。` }
    }
    if (seenKeys.has(rawKey)) return { ok: false, error: `字段 key「${rawKey}」重复。` }
    seenKeys.add(rawKey)
    if (!label) return { ok: false, error: `字段「${rawKey}」缺少 label。` }
    if (label.length > MAX_FORM_FIELD_LABEL_CHARS) {
        return { ok: false, error: `字段「${rawKey}」的 label 过长（上限 ${MAX_FORM_FIELD_LABEL_CHARS} 字）。` }
    }
    if (!FIELD_TYPES.has(rawType)) {
        return {
            ok: false,
            error: `字段「${rawKey}」的类型「${rawType}」不支持（可用：text / textarea / number / select / radio / multiselect / checkbox / date）。`,
        }
    }
    const type = rawType as FormFieldType
    const field: FormField = { key: rawKey, label, type }

    const description = text(raw.description)
    if (description) {
        if (description.length > MAX_FORM_FIELD_DESCRIPTION_CHARS) {
            return { ok: false, error: `字段「${rawKey}」的说明过长（上限 ${MAX_FORM_FIELD_DESCRIPTION_CHARS} 字）。` }
        }
        field.description = description
    }
    const placeholder = text(raw.placeholder)
    if (placeholder) field.placeholder = placeholder.slice(0, MAX_FORM_FIELD_LABEL_CHARS)
    if (raw.required === true) field.required = true

    if (type === 'select' || type === 'radio' || type === 'multiselect') {
        const normalized = normalizeOptions(raw.options, label)
        // `in` instead of a discriminant check: these modules are also compiled by
        // the package's check harness WITHOUT `strict`, where `!result.ok` does
        // not narrow a union.
        if ('error' in normalized) return normalized
        field.options = normalized.options
    }

    if (type === 'number') {
        if (isFiniteNumber(raw.min)) field.min = raw.min
        if (isFiniteNumber(raw.max)) field.max = raw.max
        if (isFiniteNumber(raw.step) && raw.step > 0) field.step = raw.step
        if (typeof field.min === 'number' && typeof field.max === 'number' && field.min > field.max) {
            return { ok: false, error: `字段「${rawKey}」的 min 不能大于 max。` }
        }
    }

    if (type === 'text' || type === 'textarea') {
        if (isFiniteNumber(raw.minLength) && raw.minLength >= 0) {
            field.minLength = clampInteger(raw.minLength, 0, MAX_FORM_TEXT_LENGTH)
        }
        if (isFiniteNumber(raw.maxLength) && raw.maxLength > 0) {
            field.maxLength = clampInteger(raw.maxLength, 1, MAX_FORM_TEXT_LENGTH)
        }
        if (typeof field.minLength === 'number' && typeof field.maxLength === 'number'
            && field.minLength > field.maxLength) {
            return { ok: false, error: `字段「${rawKey}」的 minLength 不能大于 maxLength。` }
        }
    }
    if (type === 'textarea' && isFiniteNumber(raw.rows)) {
        field.rows = clampInteger(raw.rows, 1, 20)
    }

    if (raw.defaultValue !== undefined) {
        const value = normalizeDefaultValue({ ...field, defaultValue: raw.defaultValue as FormFieldValue })
        if (value !== undefined) field.defaultValue = value
    }

    return { ok: true, field }
}

/**
 * Normalize the batch declaration. Accepts `true` (defaults), an object with
 * bounds, or nothing. `false`/absent means a single-record form.
 */
const normalizeBatchSpec = (
    raw: unknown,
): { ok: true; batch?: FormBatchSpec } | { ok: false; error: string } => {
    if (raw === undefined || raw === null || raw === false) return { ok: true }
    if (raw === true) {
        return {
            ok: true,
            batch: { minRows: 1, maxRows: DEFAULT_FORM_BATCH_MAX_ROWS, defaultRows: 1 },
        }
    }
    if (!isRecord(raw)) {
        return { ok: false, error: 'batch 需要是布尔值或对象（{ minRows, maxRows, defaultRows, rowLabel, addLabel }）。' }
    }
    const minRows = isFiniteNumber(raw.minRows)
        ? clampInteger(raw.minRows, 1, MAX_FORM_BATCH_ROWS)
        : 1
    const maxRows = isFiniteNumber(raw.maxRows)
        ? clampInteger(raw.maxRows, 1, MAX_FORM_BATCH_ROWS)
        : DEFAULT_FORM_BATCH_MAX_ROWS
    if (minRows > maxRows) {
        return { ok: false, error: `batch 的 minRows（${minRows}）不能大于 maxRows（${maxRows}）。` }
    }
    const defaultRows = isFiniteNumber(raw.defaultRows)
        ? clampInteger(raw.defaultRows, minRows, maxRows)
        : minRows
    const rowLabel = text(raw.rowLabel)
    const addLabel = text(raw.addLabel)
    return {
        ok: true,
        batch: {
            minRows,
            maxRows,
            defaultRows,
            ...(rowLabel ? { rowLabel: rowLabel.slice(0, 40) } : {}),
            ...(addLabel ? { addLabel: addLabel.slice(0, 40) } : {}),
        },
    }
}

/** Normalize an untrusted form definition (model tool arguments / host input). */
export function normalizeFormRequestInput(raw: unknown): NormalizeFormResult {
    if (!isRecord(raw)) return { ok: false, error: '表单参数必须是对象。' }

    const title = text(raw.title)
    if (!title) return { ok: false, error: '表单缺少 title。' }
    if (title.length > MAX_FORM_TITLE_CHARS) {
        return { ok: false, error: `表单 title 过长（上限 ${MAX_FORM_TITLE_CHARS} 字）。` }
    }
    const description = text(raw.description)
    if (description && description.length > MAX_FORM_DESCRIPTION_CHARS) {
        return { ok: false, error: `表单描述过长（上限 ${MAX_FORM_DESCRIPTION_CHARS} 字）。` }
    }
    const submitLabel = text(raw.submitLabel)
    const rawFields = raw.fields
    if (!Array.isArray(rawFields) || rawFields.length === 0) {
        return { ok: false, error: '表单至少需要一个字段（fields）。' }
    }
    if (rawFields.length > MAX_FORM_FIELDS) {
        return { ok: false, error: `表单最多 ${MAX_FORM_FIELDS} 个字段。` }
    }

    const fields: FormField[] = []
    const seenKeys = new Set<string>()
    for (let index = 0; index < rawFields.length; index += 1) {
        const normalized = normalizeField(rawFields[index], index, seenKeys)
        if ('error' in normalized) return normalized
        fields.push(normalized.field)
    }

    const normalizedBatch = normalizeBatchSpec(raw.batch)
    if ('error' in normalizedBatch) return normalizedBatch

    return {
        ok: true,
        input: {
            title,
            fields,
            allowCancel: raw.allowCancel !== false,
            ...(description ? { description } : {}),
            ...(submitLabel ? { submitLabel: submitLabel.slice(0, 40) } : {}),
            ...(normalizedBatch.batch ? { batch: normalizedBatch.batch } : {}),
        },
    }
}

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

const isRealDate = (value: string): boolean => {
    if (!DATE_RE.test(value)) return false
    const parsed = new Date(`${value}T00:00:00.000Z`)
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export type FormValidationResult =
    | { ok: true; values: FormValues }
    | { ok: false; error: string; fieldErrors: Record<string, string> }

const validateOneField = (
    field: FormField,
    raw: FormFieldValue | undefined,
): { ok: true; value?: FormFieldValue } | { ok: false; error: string } => {
    const empty = raw === undefined
        || raw === null
        || (typeof raw === 'string' && raw.trim() === '')
        || (Array.isArray(raw) && raw.length === 0)

    if (empty) {
        if (field.required) {
            return { ok: false, error: field.type === 'checkbox' ? '请勾选此项。' : '此项必填。' }
        }
        if (field.type === 'checkbox') return { ok: true, value: false }
        if (field.type === 'multiselect') return { ok: true, value: [] }
        return { ok: true }
    }

    switch (field.type) {
        case 'text':
        case 'textarea': {
            if (typeof raw !== 'string') return { ok: false, error: '需要一个字符串。' }
            const minLength = field.minLength ?? 0
            if (raw.length < minLength) return { ok: false, error: `至少 ${minLength} 个字符。` }
            // A declared bound wins; otherwise the global cap still applies, so one
            // pasted document cannot turn a form answer into a context bomb.
            const maxLength = field.maxLength ?? MAX_FORM_TEXT_LENGTH
            if (raw.length > maxLength) {
                return { ok: false, error: `不能超过 ${maxLength} 个字符。` }
            }
            return { ok: true, value: raw }
        }
        case 'number': {
            if (!isFiniteNumber(raw)) return { ok: false, error: '需要一个数字。' }
            if (typeof field.min === 'number' && raw < field.min) {
                return { ok: false, error: `不能小于 ${field.min}。` }
            }
            if (typeof field.max === 'number' && raw > field.max) {
                return { ok: false, error: `不能大于 ${field.max}。` }
            }
            return { ok: true, value: raw }
        }
        case 'checkbox':
            if (typeof raw !== 'boolean') return { ok: false, error: '需要一个布尔值。' }
            // A required checkbox is a confirmation ("我已阅读…"), so it is only
            // satisfied by `true` — false is a deliberate no, not an empty answer.
            if (field.required && raw !== true) return { ok: false, error: '请勾选此项。' }
            return { ok: true, value: raw }
        case 'date':
            if (typeof raw !== 'string' || !isRealDate(raw)) {
                return { ok: false, error: '日期格式应为 YYYY-MM-DD。' }
            }
            return { ok: true, value: raw }
        case 'select':
        case 'radio': {
            if (typeof raw !== 'string') return { ok: false, error: '需要一个选项值。' }
            if (!field.options?.some(option => option.value === raw)) {
                return { ok: false, error: '不是可选项之一。' }
            }
            return { ok: true, value: raw }
        }
        case 'multiselect': {
            if (!Array.isArray(raw) || raw.some(item => typeof item !== 'string')) {
                return { ok: false, error: '需要一组选项值。' }
            }
            const allowed = new Set((field.options ?? []).map(option => option.value))
            const values = Array.from(new Set(raw))
            if (values.some(item => !allowed.has(item))) {
                return { ok: false, error: '包含不可选的选项。' }
            }
            return { ok: true, value: values }
        }
        default:
            return { ok: false, error: '未知字段类型。' }
    }
}

/**
 * Validate submitted values against the form definition.
 *
 * Unknown keys are ignored (the UI submits the whole state object), required
 * empty fields are reported per key, and choices are checked against the
 * declared options. The returned `values` only contains declared fields.
 */
export function validateFormValues(fields: readonly FormField[], values: unknown): FormValidationResult {
    if (!isRecord(values)) {
        return { ok: false, error: '提交的内容必须是对象。', fieldErrors: {} }
    }
    const out: FormValues = {}
    const fieldErrors: Record<string, string> = {}
    for (const field of fields) {
        const result = validateOneField(field, values[field.key] as FormFieldValue | undefined)
        if ('error' in result) {
            fieldErrors[field.key] = result.error
            continue
        }
        if (result.value !== undefined) out[field.key] = result.value
    }
    const keys = Object.keys(fieldErrors)
    if (keys.length > 0) {
        return {
            ok: false,
            error: `表单校验未通过：${keys.map(key => {
                const field = fields.find(item => item.key === key)
                return `${field?.label ?? key}（${fieldErrors[key]}）`
            }).join('；')}`,
            fieldErrors,
        }
    }
    return { ok: true, values: out }
}

/**
 * Validate a BATCH submission: one answer object per record.
 *
 * Empty rows are ignored (the editor always keeps one blank row around, and
 * dropping a trailing blank is not an error). Errors are keyed by the row's
 * ORIGINAL index — `"0.name"` — so the UI can put each message next to the row
 * that caused it even though the stored answer drops the blank ones.
 */
export type FormRowsValidationResult =
    | { ok: true; rows: FormValues[] }
    | { ok: false; error: string; fieldErrors?: Record<string, string> }

/** True when every field of this record is untouched/empty. */
const rowIsEmpty = (fields: readonly FormField[], row: Record<string, unknown>): boolean =>
    fields.every(field => {
        const value = row[field.key]
        if (value === undefined || value === null || value === false) return true
        if (typeof value === 'string' && value.trim() === '') return true
        if (Array.isArray(value) && value.length === 0) return true
        return false
    })

export function validateFormRows(
    fields: readonly FormField[],
    rows: unknown,
    batch: FormBatchSpec,
): FormRowsValidationResult {
    if (!Array.isArray(rows)) {
        return { ok: false, error: '批量表单需要提交多条记录（rows 数组）。' }
    }
    if (rows.length > batch.maxRows) {
        return { ok: false, error: `最多填写 ${batch.maxRows} 条记录。` }
    }

    const validated: FormValues[] = []
    const fieldErrors: Record<string, string> = {}
    for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index]
        if (!isRecord(row)) {
            return { ok: false, error: `第 ${index + 1} 条记录必须是对象。` }
        }
        if (rowIsEmpty(fields, row)) continue
        const validation = validateFormValues(fields, row)
        if ('error' in validation) {
            for (const [key, message] of Object.entries(validation.fieldErrors)) {
                fieldErrors[`${index}.${key}`] = message
            }
            continue
        }
        validated.push(validation.values)
    }

    if (validated.length < batch.minRows) {
        return {
            ok: false,
            error: `至少填写 ${batch.minRows} 条记录（当前 ${validated.length} 条有效）。`,
            ...(Object.keys(fieldErrors).length > 0 ? { fieldErrors } : {}),
        }
    }
    if (Object.keys(fieldErrors).length > 0) {
        return {
            ok: false,
            error: `批量表单校验未通过：${Object.keys(fieldErrors).length} 处需要修正。`,
            fieldErrors,
        }
    }
    return { ok: true, rows: validated }
}

/* ------------------------------------------------------------------ *
 * Board helpers (pure)
 * ------------------------------------------------------------------ */

/**
 * Board order: pending forms first, in ARRIVAL order (the oldest request is the
 * one the user should fill first), then terminal forms, most recently handled
 * first. Equal timestamps keep the input order (stable tie-break), so a board
 * does not flicker between renders.
 */
export function sortFormRequests(requests: readonly FormRequestView[]): FormRequestView[] {
    return requests
        .map((request, index) => ({ request, index }))
        .sort((a, b) => {
            const aPending = a.request.status === 'pending'
            const bPending = b.request.status === 'pending'
            if (aPending !== bPending) return aPending ? -1 : 1
            if (aPending) {
                const byCreated = a.request.createdAt - b.request.createdAt
                return byCreated !== 0 ? byCreated : a.index - b.index
            }
            const aDone = a.request.answeredAt ?? a.request.cancelledAt ?? a.request.createdAt
            const bDone = b.request.answeredAt ?? b.request.cancelledAt ?? b.request.createdAt
            const byDone = bDone - aDone
            return byDone !== 0 ? byDone : a.index - b.index
        })
        .map(entry => entry.request)
}

/** Split the board into the two sections the UI renders (待填写 / 已结束). */
export function groupFormRequests(requests: readonly FormRequestView[]): {
    pending: FormRequestView[]
    finished: FormRequestView[]
} {
    const sorted = sortFormRequests(requests)
    const pending: FormRequestView[] = []
    const finished: FormRequestView[] = []
    for (const request of sorted) {
        if (request.status === 'pending') pending.push(request)
        else finished.push(request)
    }
    return { pending, finished }
}

/** One board row's human-readable answer for a field. */
export function formatFormFieldValue(field: FormField, value: FormFieldValue | undefined): string {
    if (value === undefined || value === null) return '（空）'
    if (Array.isArray(value)) {
        const labels = value.map(item => (
            field.options?.find(option => option.value === item)?.label ?? item
        ))
        return labels.length > 0 ? labels.join('、') : '（空）'
    }
    if (field.type === 'checkbox') return value ? '是' : '否'
    if (field.type === 'select' || field.type === 'radio') {
        return field.options?.find(option => option.value === value)?.label ?? String(value)
    }
    return String(value)
}

const clipText = (value: string, max = 500): string =>
    value.length > max ? `${value.slice(0, max)}…` : value

/**
 * The note injected into the conversation when an answer was NOT consumed by a
 * waiter. Values are clipped to a text channel; the full answers are also
 * readable through `getFormRequest({ formId })`.
 */
export function buildFormRequestNote(requests: readonly FormRequestView[]): string {
    const sections = requests.map(request => {
        if (request.batch && request.rows) {
            const rows = request.rows
            const lines = rows.map((row, index) => {
                const answers = request.fields
                    .filter(field => field.key in row)
                    .map(field => `${field.label}：${clipText(formatFormFieldValue(field, row[field.key]))}`)
                return `- 第 ${index + 1} 条：${answers.length > 0 ? answers.join('；') : '（空）'}`
            })
            return `【表单已填写】用户填写了「${request.title}」（formId ${request.id}，共 ${rows.length} 条）\n${lines.join('\n')}`
        }
        const answers = request.fields
            .filter(field => request.values && field.key in request.values)
            .map(field => `- ${field.label}：${clipText(formatFormFieldValue(field, request.values![field.key]))}`)
        const body = answers.length > 0 ? answers.join('\n') : '（用户没有填写任何字段）'
        return `【表单已填写】用户填写了「${request.title}」（formId ${request.id}）\n${body}`
    })
    return `${sections.join('\n\n')}\n\n请基于这些数据继续原来的任务；如果还需要其他信息，可以再调用 requestUserForm 询问用户。`
}

/* ------------------------------------------------------------------ *
 * Registry
 * ------------------------------------------------------------------ */

interface WaitingEntry {
    settle: (outcome: FormWaitOutcome) => void
    timer: ReturnType<typeof setTimeout> | null
}

export interface CreateFormRequestOptions {
    conversationId?: string | null
    owner?: string | null
    tool?: string
    meta?: Record<string, unknown>
}

const snapshot = (request: FormRequestView): FormRequestView => ({ ...request })

const terminalTime = (request: FormRequestView): number =>
    request.answeredAt ?? request.cancelledAt ?? request.createdAt

export class FormRequestRegistry {
    private readonly requests = new Map<string, FormRequestView>()
    /** Parked waiters, per request. A request usually has at most one. */
    private readonly waiters = new Map<string, Set<WaitingEntry>>()
    private readonly listeners = new Set<FormRequestListener>()
    private counter = 0
    /** Bumped on every state change: the stable snapshot for useSyncExternalStore. */
    private version = 0
    /** `listSnapshot` results cached per filter until the version moves. */
    private readonly listCache = new Map<string, { version: number; views: FormRequestView[] }>()

    /**
     * Create a request and return its view immediately. Throws on an invalid
     * definition — the tool normalizes first and turns the error into a model
     * result, so a throw here is a programming error, not a user-facing path.
     */
    create(raw: FormRequestInput | unknown, options: CreateFormRequestOptions = {}): FormRequestView {
        const normalized = normalizeFormRequestInput(raw)
        if ('error' in normalized) throw new Error(normalized.error)
        const input = normalized.input
        const request: FormRequestView = {
            id: `form-${++this.counter}`,
            title: input.title,
            fields: input.fields,
            allowCancel: input.allowCancel !== false,
            status: 'pending',
            createdAt: Date.now(),
            conversationId: options.conversationId ?? null,
            owner: options.owner ?? null,
            ...(input.description ? { description: input.description } : {}),
            ...(input.submitLabel ? { submitLabel: input.submitLabel } : {}),
            ...(input.batch ? { batch: input.batch } : {}),
            ...(options.tool ? { tool: options.tool } : {}),
            ...(options.meta ? { meta: options.meta } : {}),
        }
        this.requests.set(request.id, request)
        this.trim()
        this.emit({ type: 'created', request: snapshot(request) })
        return snapshot(request)
    }

    get(id: string): FormRequestView | undefined {
        const request = this.requests.get(id)
        return request ? snapshot(request) : undefined
    }

    list(filter?: {
        conversationId?: string | null
        owner?: string | null
        pendingOnly?: boolean
    }): FormRequestView[] {
        return Array.from(this.requests.values())
            .filter(request => {
                if (filter?.pendingOnly && request.status !== 'pending') return false
                // `undefined` means "any conversation"; `null` matches unowned ones.
                if (filter?.conversationId !== undefined
                    && (request.conversationId ?? null) !== filter.conversationId) {
                    return false
                }
                if (filter?.owner !== undefined && (request.owner ?? null) !== filter.owner) return false
                return true
            })
            .map(snapshot)
    }

    /**
     * {@link list} with a stable identity until the registry changes. This is the
     * `getSnapshot` half of `useSyncExternalStore`: React compares snapshots by
     * reference, so a fresh array on every call would re-render forever.
     */
    listSnapshot(filter?: {
        conversationId?: string | null
        owner?: string | null
        pendingOnly?: boolean
    }): FormRequestView[] {
        const key = [
            filter?.conversationId === undefined ? '*' : String(filter.conversationId),
            filter?.owner === undefined ? '*' : String(filter.owner),
            filter?.pendingOnly ? 'pending' : 'all',
        ].join('|')
        const cached = this.listCache.get(key)
        if (cached && cached.version === this.version) return cached.views
        const views = this.list(filter)
        this.listCache.set(key, { version: this.version, views })
        return views
    }

    /**
     * Park until the request is terminal or the budget expires.
     *
     * A terminal answer is consumed (marked delivered) because the caller now
     * HAS it; a timed-out wait leaves it undelivered, so a later answer still
     * becomes a note.
     */
    async wait(id: string, timeoutMs?: number): Promise<FormWaitOutcome> {
        const current = this.requests.get(id)
        if (!current) return { request: undefined, timedOut: false }
        if (current.status !== 'pending') {
            this.markDelivered(current)
            return { request: snapshot(current), timedOut: false }
        }

        const budget = clampFormWaitMs(timeoutMs)
        if (budget === 0) {
            this.markWaitExpired(current)
            return { request: snapshot(current), timedOut: true }
        }

        const outcome = await new Promise<FormWaitOutcome>(resolve => {
            const waiter: WaitingEntry = {
                settle: resolve,
                timer: setTimeout(() => {
                    this.removeWaiter(id, waiter)
                    const live = this.requests.get(id)
                    if (live && live.status === 'pending') this.markWaitExpired(live)
                    resolve({ request: live ? snapshot(live) : undefined, timedOut: true })
                }, budget),
            }
            let set = this.waiters.get(id)
            if (!set) {
                set = new Set()
                this.waiters.set(id, set)
            }
            set.add(waiter)

            // Re-check after subscribing: the request may have settled between
            // the read above and this subscription (the await boundary is real).
            const latest = this.requests.get(id)
            if (!latest || latest.status !== 'pending') {
                this.removeWaiter(id, waiter)
                if (latest) this.markDelivered(latest)
                resolve({ request: latest ? snapshot(latest) : undefined, timedOut: false })
            }
        })
        return outcome
    }

    /**
     * Read one request. An ANSWERED request is consumed: the caller has now seen
     * the answers, so the notification path must not announce them again.
     */
    consume(id: string): FormRequestView | undefined {
        const request = this.requests.get(id)
        if (!request) return undefined
        if (request.status === 'answered' && request.deliveredAt === undefined) {
            request.deliveredAt = Date.now()
            this.touch()
        }
        return snapshot(request)
    }

    /**
     * Submit answers. Returns a validation/state error instead of throwing so the
     * UI can surface it inline and a stale double-submit cannot 500.
     */
    submit(id: string, values: unknown): FormSubmitResult {
        const request = this.requests.get(id)
        if (!request) return { ok: false, error: '没有找到这张表单（可能已过期）。' }
        if (request.status !== 'pending') {
            return { ok: false, error: `这张表单已经处理过了（${statusText(request.status)}）。` }
        }
        let answeredValues: FormValues | undefined
        let answeredRows: FormValues[] | undefined
        if (request.batch) {
            const validation = validateFormRows(request.fields, values, request.batch)
            if ('error' in validation) {
                return { ok: false, error: validation.error, fieldErrors: validation.fieldErrors }
            }
            answeredRows = validation.rows
        } else {
            const validation = validateFormValues(request.fields, values)
            if ('error' in validation) {
                return { ok: false, error: validation.error, fieldErrors: validation.fieldErrors }
            }
            answeredValues = validation.values
        }

        request.status = 'answered'
        request.values = answeredValues
        request.rows = answeredRows
        request.answeredAt = Date.now()
        request.waitExpiredAt = undefined

        // A parked caller is about to receive these values: that IS the delivery.
        if ((this.waiters.get(id)?.size ?? 0) > 0) request.deliveredAt = request.answeredAt
        this.emit({ type: 'answered', request: snapshot(request) })
        this.settleWaiters(request)
        return { ok: true, request: snapshot(request) }
    }

    /** Withdraw a pending request. Returns false for unknown/terminal requests. */
    cancel(id: string, reason?: string): boolean {
        const request = this.requests.get(id)
        if (!request || request.status !== 'pending') return false
        request.status = 'cancelled'
        request.cancelledAt = Date.now()
        request.cancelReason = reason?.trim() || '用户取消了填写'
        request.waitExpiredAt = undefined
        this.settleWaiters(request)
        this.emit({ type: 'cancelled', request: snapshot(request) })
        return true
    }

    /**
     * Subscribe to any change. `useSyncExternalStore`-shaped: pair with
     * {@link getVersion}, and the component re-renders only when something
     * actually changed.
     */
    subscribe(listener: () => void): () => void {
        return this.on(() => listener())
    }

    /** Subscribe to lifecycle transitions (created / answered / cancelled). */
    on(listener: FormRequestListener): () => void {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
    }

    /** Monotonic state version; stable between changes. */
    getVersion(): number {
        return this.version
    }

    /** Answered requests whose answers the agent has not been shown yet. */
    undelivered(conversationId?: string | null): FormRequestView[] {
        return Array.from(this.requests.values())
            .filter(request => {
                if (request.status !== 'answered' || request.deliveredAt !== undefined) return false
                if (conversationId !== undefined
                    && (request.conversationId ?? null) !== conversationId) {
                    return false
                }
                return true
            })
            .map(snapshot)
    }

    /**
     * Claim the undelivered answers of a conversation. The caller commits to
     * showing them to the agent; they will not be offered again.
     */
    takeUndelivered(conversationId?: string | null): FormRequestView[] {
        const claimed = this.undelivered(conversationId)
        if (claimed.length === 0) return []
        const now = Date.now()
        for (const view of claimed) {
            const live = this.requests.get(view.id)
            if (live && live.deliveredAt === undefined) live.deliveredAt = now
        }
        this.touch()
        return claimed
    }

    /** The note injected into the conversation for one or many answers. */
    describe(requests: FormRequestView[]): string {
        return buildFormRequestNote(requests)
    }

    /** Test/reset hook: drops all state, settles parked waiters as "gone". */
    reset(): void {
        for (const set of this.waiters.values()) {
            for (const waiter of set) {
                if (waiter.timer) clearTimeout(waiter.timer)
                try {
                    waiter.settle({ request: undefined, timedOut: false })
                } catch {
                    // A waiter callback must not break reset.
                }
            }
        }
        this.waiters.clear()
        this.requests.clear()
        this.listeners.clear()
        this.listCache.clear()
        this.counter = 0
        this.version += 1
    }

    private removeWaiter(id: string, waiter: WaitingEntry): void {
        if (waiter.timer) clearTimeout(waiter.timer)
        const set = this.waiters.get(id)
        if (!set) return
        set.delete(waiter)
        if (set.size === 0) this.waiters.delete(id)
    }

    private settleWaiters(request: FormRequestView): void {
        const set = this.waiters.get(request.id)
        if (!set || set.size === 0) return
        this.waiters.delete(request.id)
        for (const waiter of set) {
            if (waiter.timer) clearTimeout(waiter.timer)
            try {
                waiter.settle({ request: snapshot(request), timedOut: false })
            } catch (error: any) {
                console.warn('[form-requests] waiter failed:', error?.message ?? error)
            }
        }
    }

    private markDelivered(request: FormRequestView): void {
        const live = this.requests.get(request.id)
        if (live && live.deliveredAt === undefined) {
            live.deliveredAt = Date.now()
            this.touch()
        }
    }

    private markWaitExpired(request: FormRequestView): void {
        const live = this.requests.get(request.id)
        if (live && live.status === 'pending' && live.waitExpiredAt === undefined) {
            live.waitExpiredAt = Date.now()
            this.touch()
        }
    }

    private emit(event: FormRequestEvent): void {
        this.touch()
        for (const listener of Array.from(this.listeners)) {
            try {
                listener(event)
            } catch (error: any) {
                console.warn('[form-requests] listener failed:', error?.message ?? error)
            }
        }
    }

    /** Version bump without a lifecycle event (delivery / wait-expiry). */
    private touch(): void {
        this.version += 1
        this.listCache.clear()
        for (const listener of Array.from(this.listeners)) {
            try {
                listener(undefined)
            } catch (error: any) {
                console.warn('[form-requests] listener failed:', error?.message ?? error)
            }
        }
    }

    /**
     * Drop the oldest terminal requests once the map is over budget.
     *
     * Undelivered ANSWERS are evicted last: losing one means the agent is never
     * told the user filled its form. Pending requests are never evicted unless
     * there is nothing else left (100 unanswered forms is not a real session).
     */
    private trim(): void {
        if (this.requests.size <= MAX_FORM_REQUESTS) return
        const terminal = Array.from(this.requests.values())
            .filter(request => request.status !== 'pending')
            .sort((a, b) => {
                const aPending = a.deliveredAt === undefined && a.status === 'answered' ? 1 : 0
                const bPending = b.deliveredAt === undefined && b.status === 'answered' ? 1 : 0
                if (aPending !== bPending) return aPending - bPending
                return terminalTime(a) - terminalTime(b)
            })
        for (const request of terminal) {
            if (this.requests.size <= MAX_FORM_REQUESTS) break
            this.requests.delete(request.id)
        }
        this.listCache.clear()
    }
}

/* ------------------------------------------------------------------ *
 * Host availability
 *
 * A form only works where something can RENDER it. The tool set is global
 * (every agent surface shares the core factories), so a surface that never
 * mounts the form UI — e.g. a bare agent panel — would otherwise create a
 * request and park for the full wait budget with nothing on screen. Surfaces
 * with the inline card / unified inbox register themselves; the tool fails fast
 * and tells the model when nobody did.
 *
 * Ref-counted because chat surfaces are stacked (dock + /ai page + per-tab
 * conversation panels) and React StrictMode mounts effects twice.
 * ------------------------------------------------------------------ */

let formHostDepth = 0

/** Register one mounted form UI. Returns the ref-counted unregister function. */
export function registerFormRequestHost(): () => void {
    formHostDepth += 1
    let released = false
    return () => {
        if (released) return
        released = true
        formHostDepth = Math.max(0, formHostDepth - 1)
    }
}

/** True when at least one surface can render and submit a form. */
export function formRequestHostAvailable(): boolean {
    return formHostDepth > 0
}

/** Test/reset hook for the ref-counted host registration. */
export function resetFormRequestHost(): void {
    formHostDepth = 0
}

/** Process-wide registry: one window, one inbox of form requests. */
export const formRequests = new FormRequestRegistry()

/**
 * Deliver answered-but-unseen forms to the conversation. Mirrors
 * `flushBackgroundTaskNotes`: the caller decides WHEN (run idle), the registry
 * guarantees exactly-once.
 */
export function flushFormRequestNotes(options: {
    conversationId?: string | null
    /** Read live: a run may have started since the last render. */
    isBusy: () => boolean
    onNotify: (requests: FormRequestView[], note: string) => void
}): boolean {
    const conversationId = options.conversationId
    if (!conversationId) return false
    if (options.isBusy()) return false
    const answered = formRequests.takeUndelivered(conversationId)
    if (answered.length === 0) return false
    options.onNotify(answered, formRequests.describe(answered))
    return true
}