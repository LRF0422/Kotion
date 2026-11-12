/**
 * Agent Form Card — the shared renderer for agent-declared dynamic forms.
 *
 * A tool can ask the user for STRUCTURED data at run time (`requestUserForm`):
 * the model declares the fields, the host renders them. The same card is also
 * used in BATCH mode, where one field set is repeated per record (批量填写),
 * e.g. "把这三个成员加进组织".
 *
 * This component lives in `@kn/ui` and is deliberately dependency-free with
 * respect to `@kn/common`: request/answers/validation are declared here
 * structurally, field-for-field with the kernel contract (same approach as
 * `ToolApprovalCard`). The host adapter owns registry, validation and
 * persistence; this card only renders, collects input and reports errors.
 *
 * Single-record requests are built from the `@kn/ui` Field family (`FieldSet`,
 * `FieldGroup`, `Field`, `FieldLabel`, `FieldDescription`, `FieldError`,
 * `FieldSeparator`) so labels, help text and error regions stay consistent with
 * the rest of the product. BATCH requests render a real table instead (columns =
 * fields, rows = records) so the user fills cells directly and Enter walks down
 * a column — a card per record is far too slow for bulk entry. There are no
 * hand-written label/error blocks and no native `<button>` elements.
 */

import React, { useCallback, useEffect, useId, useRef, useState } from 'react'
import {
    CheckCircle2,
    ChevronDown,
    CircleSlash,
    ClipboardList,
    Loader2,
    Plus,
    Send,
    Trash2,
    XCircle,
} from '@kn/icon'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Checkbox } from '../ui/checkbox'
import {
    Field,
    FieldContent,
    FieldDescription,
    FieldError,
    FieldGroup,
    FieldLabel,
    FieldSeparator,
} from '../ui/field'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { RadioGroup, RadioGroupItem } from '../ui/radio-group'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '../ui/select'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '../ui/table'
import { Textarea } from '../ui/textarea'
import { cn } from '../../lib/utils'

/* ------------------------------------------------------------------ *
 * Structural mirrors of the kernel contract (no @kn/common import)
 * ------------------------------------------------------------------ */

export type AgentFormFieldType =
    | 'text'
    | 'textarea'
    | 'number'
    | 'select'
    | 'radio'
    | 'multiselect'
    | 'checkbox'
    | 'date'

export interface AgentFormFieldOption {
    value: string
    label: string
    description?: string
}

export interface AgentFormField {
    key: string
    label: string
    type: AgentFormFieldType
    description?: string
    placeholder?: string
    required?: boolean
    options?: AgentFormFieldOption[]
    defaultValue?: string | number | boolean | string[] | null
    min?: number
    max?: number
    step?: number
    minLength?: number
    maxLength?: number
    rows?: number
}

export interface AgentFormBatchSpec {
    minRows: number
    maxRows: number
    defaultRows: number
    rowLabel?: string
    addLabel?: string
}

export type AgentFormStatus = 'pending' | 'answered' | 'cancelled'

export interface AgentFormRequest {
    id: string
    title: string
    description?: string
    submitLabel?: string
    allowCancel: boolean
    status: AgentFormStatus
    fields: AgentFormField[]
    /** Present when the same field set is repeated per record. */
    batch?: AgentFormBatchSpec
    /** Validated answers for a single-record form (once answered). */
    values?: Record<string, unknown>
    /** Validated records for a batch form (once answered). */
    rows?: Array<Record<string, unknown>>
    answeredAt?: number
    cancelledAt?: number
    cancelReason?: string
    waitExpiredAt?: number
}

/** What the card hands to the host on submit. */
export type AgentFormSubmitPayload =
    | { kind: 'single'; values: Record<string, unknown> }
    | { kind: 'batch'; rows: Array<Record<string, unknown>> }

/**
 * Host verdict. Batch errors use the `"rowIndex.fieldKey"` key convention so
 * each message can be placed next to the row/field that caused it.
 */
export type AgentFormSubmitResult =
    | { ok: true }
    | { ok: false; error?: string; fieldErrors?: Record<string, string> }

/** Overridable copy; defaults are the Chinese product copy used across the app. */
export interface AgentFormCardLabels {
    submit?: string
    submitting?: string
    cancel?: string
    addRow?: string
    removeRow?: string
    /** 0-based record index → label shown above that record. */
    rowTitle?: (index: number) => string
    required?: string
    pending?: string
    answered?: string
    cancelled?: string
    cancelReason?: string
    waitExpired?: string
    selectPlaceholder?: string
    emptyValue?: string
    validationFailed?: string
    /** Hint above a batch table, e.g. "表格填写：1–20 条，Enter 跳到下一行". */
    batchHint?: string
    /** Shown when the editor reached `batch.maxRows`, e.g. "已达 20 行上限". */
    batchLimit?: string
    /** First table column header (record number); defaults to "#". */
    rowNumber?: string
    /** Placeholder of a multiselect cell before anything is picked. */
    multiSelectPlaceholder?: string
    /** Trigger label for a multiselect cell that has picks; defaults to "已选 N 项". */
    selectedCount?: (count: number) => string
}

export interface AgentFormCardProps {
    request: AgentFormRequest
    /**
     * Validate + persist the answer. Resolve with `{ ok: false }` to keep the
     * form open and show the returned field errors.
     */
    onSubmit: (payload: AgentFormSubmitPayload) => AgentFormSubmitResult | Promise<AgentFormSubmitResult>
    /** Dismiss the request (rendered only when `request.allowCancel`). */
    onCancel?: () => void
    labels?: AgentFormCardLabels
    className?: string
}

/* ------------------------------------------------------------------ *
 * Pure helpers
 * ------------------------------------------------------------------ */

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
const WEEK_MS = 7 * DAY_MS

/**
 * Relative time ("刚刚" / "3 分钟前"), shared by the card and the inbox board.
 *
 * Pure on purpose: bodies that tick pass their own `now`, and render paths that
 * must not allocate timers just call it with the default.
 */
export function formatFormRelativeTime(timestamp: number, now: number = Date.now()): string {
    const diff = Math.max(0, now - timestamp)
    if (diff < MINUTE_MS) return '刚刚'
    if (diff < HOUR_MS) return `${Math.floor(diff / MINUTE_MS)} 分钟前`
    if (diff < DAY_MS) return `${Math.floor(diff / HOUR_MS)} 小时前`
    if (diff < WEEK_MS) return `${Math.floor(diff / DAY_MS)} 天前`
    return new Date(timestamp).toLocaleDateString('zh-CN')
}

/**
 * IME guard for "Enter submits" inputs. Structural copy of the kernel helper
 * (`@kn/common`'s `isImeComposing`) — the ui package must not depend on common.
 */
function isImeComposing(
    event: {
        nativeEvent?: { isComposing?: boolean; keyCode?: number }
        isComposing?: boolean
        keyCode?: number
    } | null | undefined,
): boolean {
    if (!event) return false
    const native = event.nativeEvent
    const composing = native?.isComposing ?? event.isComposing
    const keyCode = native?.keyCode ?? event.keyCode
    return composing === true || keyCode === 229
}

/** Initial value for one field (`''` for an empty number, as a controlled input needs). */
const initialValueFor = (field: AgentFormField): unknown => {
    const defaultValue = field.defaultValue
    switch (field.type) {
        case 'checkbox':
            return typeof defaultValue === 'boolean' ? defaultValue : false
        case 'multiselect':
            return Array.isArray(defaultValue) ? [...defaultValue] : []
        case 'number':
            return typeof defaultValue === 'number' && Number.isFinite(defaultValue) ? defaultValue : ''
        default:
            return typeof defaultValue === 'string' ? defaultValue : ''
    }
}

const buildInitialValues = (fields: readonly AgentFormField[]): Record<string, unknown> => {
    const values: Record<string, unknown> = {}
    for (const field of fields) values[field.key] = initialValueFor(field)
    return values
}

const stringValue = (value: unknown): string => (typeof value === 'string' ? value : '')

const numberValue = (value: unknown): string =>
    typeof value === 'number' && Number.isFinite(value) ? String(value) : ''

const selectedValues = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

/** Human-readable answer for read-only summaries (structural mirror of the kernel formatter). */
const formatFieldValue = (
    field: AgentFormField,
    value: unknown,
    emptyValue: string,
): string => {
    if (value === undefined || value === null) return emptyValue
    if (Array.isArray(value)) {
        const labels = value.map(item => (
            field.options?.find(option => option.value === item)?.label ?? String(item)
        ))
        return labels.length > 0 ? labels.join('、') : emptyValue
    }
    if (field.type === 'checkbox') return value ? '是' : '否'
    if (field.type === 'select' || field.type === 'radio') {
        return field.options?.find(option => option.value === value)?.label ?? String(value)
    }
    return String(value)
}

const clampRowCount = (batch: AgentFormBatchSpec): number => {
    const raw = Number.isFinite(batch.defaultRows) ? batch.defaultRows : batch.minRows
    return Math.max(batch.minRows, Math.min(batch.maxRows, Math.floor(raw)))
}

interface BatchRowState {
    /** Stable React key; never used as an answer key. */
    id: string
    values: Record<string, unknown>
}

const DEFAULT_LABELS = {
    submit: '提交',
    submitting: '提交中…',
    cancel: '取消',
    addRow: '添加一条',
    removeRow: '删除',
    required: '必填',
    pending: '待填写',
    answered: '已填写',
    cancelled: '已取消',
    cancelReason: '取消原因',
    waitExpired: 'agent 已停止等待，现在填写仍会作为通知送回会话。',
    selectPlaceholder: '请选择',
    emptyValue: '（空）',
    validationFailed: '请检查标红的字段后再提交。',
} as const

/* ------------------------------------------------------------------ *
 * One field (label + help + control + error), all from the Field family
 * ------------------------------------------------------------------ */

interface RenderFieldOptions {
    field: AgentFormField
    value: unknown
    /** Unique per card instance / row / field. */
    id: string
    error?: string
    onChange: (value: unknown) => void
    labels: AgentFormCardLabels
}

const renderControl = ({ field, value, id, error, onChange, labels }: RenderFieldOptions) => {
    const invalid = Boolean(error)
    const describedBy = [
        field.description ? `${id}-desc` : null,
        error ? `${id}-error` : null,
    ].filter(Boolean).join(' ') || undefined
    const required = field.required || undefined

    switch (field.type) {
        case 'text':
            return (
                <Input
                    id={id}
                    type="text"
                    value={stringValue(value)}
                    placeholder={field.placeholder}
                    minLength={field.minLength}
                    maxLength={field.maxLength}
                    autoComplete="off"
                    className="h-9 text-xs"
                    aria-invalid={invalid || undefined}
                    aria-describedby={describedBy}
                    aria-required={required}
                    onChange={event => onChange(event.target.value)}
                />
            )
        case 'textarea':
            return (
                <Textarea
                    id={id}
                    rows={field.rows ?? 3}
                    value={stringValue(value)}
                    placeholder={field.placeholder}
                    minLength={field.minLength}
                    maxLength={field.maxLength}
                    className="min-h-[64px] resize-y text-xs leading-relaxed"
                    aria-invalid={invalid || undefined}
                    aria-describedby={describedBy}
                    aria-required={required}
                    onChange={event => onChange(event.target.value)}
                />
            )
        case 'number':
            return (
                <Input
                    id={id}
                    type="number"
                    value={numberValue(value)}
                    placeholder={field.placeholder}
                    min={field.min}
                    max={field.max}
                    step={field.step}
                    className="h-9 text-xs"
                    aria-invalid={invalid || undefined}
                    aria-describedby={describedBy}
                    aria-required={required}
                    onChange={event => {
                        const raw = event.target.value
                        if (raw === '') {
                            onChange('')
                            return
                        }
                        const parsed = Number(raw)
                        onChange(Number.isFinite(parsed) ? parsed : '')
                    }}
                />
            )
        case 'date':
            return (
                <Input
                    id={id}
                    type="date"
                    value={stringValue(value)}
                    className="h-9 text-xs"
                    aria-invalid={invalid || undefined}
                    aria-describedby={describedBy}
                    aria-required={required}
                    onChange={event => onChange(event.target.value)}
                />
            )
        case 'select':
            return (
                <Select
                    value={stringValue(value)}
                    onValueChange={next => onChange(next)}
                >
                    <SelectTrigger
                        id={id}
                        className="h-9 text-xs"
                        aria-invalid={invalid || undefined}
                        aria-describedby={describedBy}
                        aria-required={required}
                    >
                        <SelectValue placeholder={field.placeholder ?? labels.selectPlaceholder} />
                    </SelectTrigger>
                    <SelectContent>
                        {(field.options ?? []).map(option => (
                            <SelectItem key={option.value} value={option.value} className="text-xs">
                                <span className="flex min-w-0 flex-col">
                                    <span className="truncate">{option.label}</span>
                                    {option.description && (
                                        <span className="truncate text-[10px] text-muted-foreground">
                                            {option.description}
                                        </span>
                                    )}
                                </span>
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            )
        case 'radio':
            return (
                <RadioGroup
                    value={stringValue(value)}
                    onValueChange={next => onChange(next)}
                    aria-labelledby={`${id}-label`}
                    aria-invalid={invalid || undefined}
                    aria-describedby={describedBy}
                    aria-required={required}
                    className="max-h-48 gap-0.5 overflow-y-auto pr-1"
                >
                    {(field.options ?? []).map(option => {
                        const optionId = `${id}-opt-${option.value}`
                        return (
                            <div key={option.value} className="flex min-h-[34px] items-center gap-2">
                                <RadioGroupItem id={optionId} value={option.value} />
                                <FieldContent className="gap-0.5">
                                    <FieldLabel
                                        htmlFor={optionId}
                                        className="text-xs font-normal leading-tight text-foreground/90"
                                    >
                                        {option.label}
                                    </FieldLabel>
                                    {option.description && (
                                        <FieldDescription className="text-[10px]">
                                            {option.description}
                                        </FieldDescription>
                                    )}
                                </FieldContent>
                            </div>
                        )
                    })}
                </RadioGroup>
            )
        case 'multiselect': {
            const checkedValues = selectedValues(value)
            return (
                <div
                    role="group"
                    aria-labelledby={`${id}-label`}
                    className="max-h-48 space-y-0.5 overflow-y-auto pr-1"
                >
                    {(field.options ?? []).map(option => {
                        const optionId = `${id}-opt-${option.value}`
                        return (
                            <div key={option.value} className="flex min-h-[34px] items-center gap-2">
                                <Checkbox
                                    id={optionId}
                                    checked={checkedValues.includes(option.value)}
                                    aria-invalid={invalid || undefined}
                                    onCheckedChange={next => {
                                        const checked = next === true
                                        onChange(
                                            checked
                                                ? (checkedValues.includes(option.value)
                                                    ? checkedValues
                                                    : [...checkedValues, option.value])
                                                : checkedValues.filter(item => item !== option.value),
                                        )
                                    }}
                                />
                                <FieldContent className="gap-0.5">
                                    <FieldLabel
                                        htmlFor={optionId}
                                        className="text-xs font-normal leading-tight text-foreground/90"
                                    >
                                        {option.label}
                                    </FieldLabel>
                                    {option.description && (
                                        <FieldDescription className="text-[10px]">
                                            {option.description}
                                        </FieldDescription>
                                    )}
                                </FieldContent>
                            </div>
                        )
                    })}
                </div>
            )
        }
        case 'checkbox':
            return (
                <Checkbox
                    id={id}
                    checked={value === true}
                    className="mt-0.5"
                    aria-invalid={invalid || undefined}
                    aria-describedby={describedBy}
                    aria-required={required}
                    onCheckedChange={next => onChange(next === true)}
                />
            )
        default:
            return null
    }
}

const renderField = (options: RenderFieldOptions) => {
    const { field, value, id, error, onChange, labels } = options
    const invalid = Boolean(error)
    const requiredMark = field.required ? (
        <span aria-hidden title={labels.required} className="text-destructive">*</span>
    ) : null

    // A checkbox is its own label row ("我已阅读…"), not a label + control stack.
    if (field.type === 'checkbox') {
        return (
            <Field
                key={field.key}
                orientation="horizontal"
                data-invalid={invalid || undefined}
                className="items-start gap-2"
            >
                {renderControl(options)}
                <FieldContent className="gap-1">
                    <FieldLabel htmlFor={id} className="text-[11px] font-medium leading-snug">
                        {field.label}
                        {requiredMark}
                    </FieldLabel>
                    {field.description && (
                        <FieldDescription id={`${id}-desc`} className="text-[10px] leading-snug">
                            {field.description}
                        </FieldDescription>
                    )}
                    <FieldError id={`${id}-error`} className="text-[10px]">
                        {error}
                    </FieldError>
                </FieldContent>
            </Field>
        )
    }

    const group = field.type === 'radio' || field.type === 'multiselect'
    return (
        <Field key={field.key} data-invalid={invalid || undefined} className="gap-1">
            <FieldLabel
                {...(group ? { id: `${id}-label` } : { htmlFor: id })}
                className="text-[11px] font-medium leading-none text-foreground/80"
            >
                <span className="min-w-0 truncate">{field.label}</span>
                {requiredMark}
            </FieldLabel>
            {field.description && (
                <FieldDescription id={`${id}-desc`} className="text-[10px] leading-snug">
                    {field.description}
                </FieldDescription>
            )}
            <div className="pt-0.5">{renderControl(options)}</div>
            <FieldError id={`${id}-error`} className="text-[10px]">
                {error}
            </FieldError>
        </Field>
    )
}

/* ------------------------------------------------------------------ *
 * Batch cells — a grid where columns are fields and rows are records
 * ------------------------------------------------------------------ */

/** Per-kind column widths: dense, but wide enough for real values to read. */
const BATCH_COLUMN_WIDTH: Record<AgentFormFieldType, string> = {
    text: 'min-w-[160px]',
    textarea: 'min-w-[180px]',
    number: 'min-w-[100px]',
    select: 'min-w-[140px]',
    radio: 'min-w-[140px]',
    multiselect: 'min-w-[150px]',
    checkbox: 'min-w-[72px]',
    date: 'min-w-[140px]',
}

interface RenderBatchCellOptions extends RenderFieldOptions {
    /** `"rowIndex.fieldKey"` — also the row/column identifier Enter uses. */
    cellKey: string
}

/**
 * The control inside one table cell. Batch cells are single-control by design
 * (a table row per record), so `radio` uses a compact Select and multiselect
 * uses a Popover + checkbox list instead of the taller single-form widgets.
 */
const renderBatchCellControl = ({
    field,
    value,
    id,
    cellKey,
    error,
    onChange,
    labels,
}: RenderBatchCellOptions) => {
    const invalid = Boolean(error)
    const describedBy = error ? `${id}-error` : undefined
    const required = field.required || undefined
    const common = {
        id,
        'data-cell': cellKey,
        'aria-invalid': invalid || undefined,
        'aria-describedby': describedBy,
        'aria-required': required,
    }

    switch (field.type) {
        case 'text':
            return (
                <Input
                    {...common}
                    type="text"
                    value={stringValue(value)}
                    placeholder={field.placeholder}
                    minLength={field.minLength}
                    maxLength={field.maxLength}
                    autoComplete="off"
                    className="h-8 w-full text-xs"
                    onChange={event => onChange(event.target.value)}
                />
            )
        case 'number':
            return (
                <Input
                    {...common}
                    type="number"
                    value={numberValue(value)}
                    placeholder={field.placeholder}
                    min={field.min}
                    max={field.max}
                    step={field.step}
                    className="h-8 w-full text-xs"
                    onChange={event => {
                        const raw = event.target.value
                        if (raw === '') {
                            onChange('')
                            return
                        }
                        const parsed = Number(raw)
                        onChange(Number.isFinite(parsed) ? parsed : '')
                    }}
                />
            )
        case 'date':
            return (
                <Input
                    {...common}
                    type="date"
                    value={stringValue(value)}
                    className="h-8 w-full text-xs"
                    onChange={event => onChange(event.target.value)}
                />
            )
        case 'textarea':
            return (
                <Textarea
                    {...common}
                    rows={1}
                    value={stringValue(value)}
                    placeholder={field.placeholder}
                    minLength={field.minLength}
                    maxLength={field.maxLength}
                    className="min-h-8 max-h-24 w-full resize-y py-1 text-xs leading-snug"
                    onChange={event => onChange(event.target.value)}
                />
            )
        case 'select':
        case 'radio':
            return (
                <Select value={stringValue(value)} onValueChange={next => onChange(next)}>
                    <SelectTrigger {...common} className="h-8 w-full text-xs">
                        <SelectValue placeholder={field.placeholder ?? labels.selectPlaceholder} />
                    </SelectTrigger>
                    <SelectContent>
                        {(field.options ?? []).map(option => (
                            <SelectItem key={option.value} value={option.value} className="text-xs">
                                <span className="flex min-w-0 flex-col">
                                    <span className="truncate">{option.label}</span>
                                    {option.description && (
                                        <span className="truncate text-[10px] text-muted-foreground">
                                            {option.description}
                                        </span>
                                    )}
                                </span>
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            )
        case 'multiselect': {
            const picked = selectedValues(value)
            const countLabel = labels.selectedCount ?? ((count: number) => `已选 ${count} 项`)
            return (
                <Popover>
                    <PopoverTrigger asChild>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            {...common}
                            className="h-8 w-full justify-between gap-1 px-2 text-xs font-normal"
                        >
                            <span className="truncate">
                                {picked.length > 0
                                    ? countLabel(picked.length)
                                    : (labels.multiSelectPlaceholder ?? '选择…')}
                            </span>
                            <ChevronDown className="h-3 w-3 shrink-0 opacity-50" aria-hidden />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" sideOffset={4} className="w-56 p-1">
                        <div className="max-h-56 overflow-y-auto">
                            {(field.options ?? []).map(option => {
                                const optionId = `${id}-opt-${option.value}`
                                const checked = picked.includes(option.value)
                                return (
                                    <div
                                        key={option.value}
                                        className="flex items-start gap-2 rounded px-1.5 py-1 hover:bg-muted/60"
                                    >
                                        <Checkbox
                                            id={optionId}
                                            checked={checked}
                                            className="mt-0.5"
                                            onCheckedChange={next => {
                                                const on = next === true
                                                onChange(
                                                    on
                                                        ? (checked ? picked : [...picked, option.value])
                                                        : picked.filter(item => item !== option.value),
                                                )
                                            }}
                                        />
                                        <Label
                                            htmlFor={optionId}
                                            className="min-w-0 flex-1 cursor-pointer text-xs font-normal leading-snug"
                                        >
                                            <span className="block truncate">{option.label}</span>
                                            {option.description && (
                                                <span className="block truncate text-[10px] text-muted-foreground">
                                                    {option.description}
                                                </span>
                                            )}
                                        </Label>
                                    </div>
                                )
                            })}
                        </div>
                    </PopoverContent>
                </Popover>
            )
        }
        case 'checkbox':
            return (
                <div className="flex items-center justify-center py-0.5">
                    <Checkbox
                        {...common}
                        checked={value === true}
                        aria-label={`${field.label}（第 ${Number(cellKey.split(':')[0]) + 1} 行）`}
                        onCheckedChange={next => onChange(next === true)}
                    />
                </div>
            )
        default:
            return null
    }
}

/** Control + its error in one cell (error keys are `"rowIndex.fieldKey"`). */
const renderBatchCell = (options: RenderBatchCellOptions) => (
    <div className="space-y-1">
        {renderBatchCellControl(options)}
        <FieldError id={`${options.id}-error`} className="text-[10px]">
            {options.error}
        </FieldError>
    </div>
)

/* ------------------------------------------------------------------ *
 * Card
 * ------------------------------------------------------------------ */

/**
 * One agent form: editable while `pending`, read-only summary once terminal.
 * Batch requests (`request.batch`) render a table grid instead of a card per
 * record; readonly batch answers use the same table.
 */
export const AgentFormCard: React.FC<AgentFormCardProps> = ({
    request,
    onSubmit,
    onCancel,
    labels: labelOverrides,
    className,
}) => {
    const labels: AgentFormCardLabels = {
        ...DEFAULT_LABELS,
        ...labelOverrides,
    }
    const baseId = useId()
    const batch = request.batch
    const isBatch = Boolean(batch)
    const isPending = request.status === 'pending'

    const initialBatchCount = batch ? clampRowCount(batch) : 0
    const rowCounter = useRef(0)
    const makeRow = (fields: readonly AgentFormField[]): BatchRowState => {
        rowCounter.current += 1
        return { id: `row-${rowCounter.current}`, values: buildInitialValues(fields) }
    }

    const [values, setValues] = useState<Record<string, unknown>>(() => buildInitialValues(request.fields))
    const [rows, setRows] = useState<BatchRowState[]>(() => {
        if (!batch) return []
        return Array.from({ length: initialBatchCount }, () => makeRow(request.fields))
    })
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
    const [generalError, setGeneralError] = useState<string | null>(null)
    const [submitting, setSubmitting] = useState(false)
    /** Only a NEW request id resets the draft; the initial mount is already fresh. */
    const resetKeyRef = useRef(request.id)

    // The board reuses one expanded card slot for different requests: reset the
    // local draft instead of leaking answers across forms.
    useEffect(() => {
        if (resetKeyRef.current === request.id) return
        resetKeyRef.current = request.id
        rowCounter.current = 0
        setValues(buildInitialValues(request.fields))
        setRows(batch
            ? Array.from({ length: clampRowCount(batch) }, () => makeRow(request.fields))
            : [])
        setFieldErrors({})
        setGeneralError(null)
        setSubmitting(false)
        // Only the identity matters: the field/batch definition is immutable for
        // a given request id, and depending on object identity would loop when
        // the host rebuilds its view object every render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [request.id])

    const clearError = useCallback((key: string) => {
        setFieldErrors(prev => {
            if (!(key in prev)) return prev
            const next = { ...prev }
            delete next[key]
            return next
        })
        setGeneralError(null)
    }, [])

    const setSingleValue = useCallback((key: string, value: unknown) => {
        setValues(prev => ({ ...prev, [key]: value }))
        clearError(key)
    }, [clearError])

    const setRowValue = useCallback((rowIndex: number, key: string, value: unknown) => {
        setRows(prev => prev.map((row, index) => (
            index === rowIndex ? { ...row, values: { ...row.values, [key]: value } } : row
        )))
        clearError(`${rowIndex}.${key}`)
    }, [clearError])

    const addRow = useCallback(() => {
        if (!batch || rows.length >= batch.maxRows) return
        setRows(prev => (prev.length >= batch.maxRows ? prev : [...prev, makeRow(request.fields)]))
        // Indices do not shift on append; adding is still a fresh editing state.
        setGeneralError(null)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [batch, request.fields, rows.length])

    const removeRow = useCallback((rowIndex: number) => {
        if (!batch || rows.length <= batch.minRows) return
        setRows(prev => prev.filter((_, index) => index !== rowIndex))
        // Error keys embed the row index, so drop all of them rather than remap.
        setFieldErrors({})
        setGeneralError(null)
    }, [batch, rows.length])

    const submit = useCallback(async () => {
        if (submitting || !isPending) return
        setSubmitting(true)
        setGeneralError(null)
        setFieldErrors({})
        try {
            const payload: AgentFormSubmitPayload = isBatch
                ? { kind: 'batch', rows: rows.map(row => row.values) }
                : { kind: 'single', values }
            const result = await onSubmit(payload)
            if (!result.ok) {
                setFieldErrors(result.fieldErrors ?? {})
                setGeneralError(result.error ?? labels.validationFailed ?? DEFAULT_LABELS.validationFailed)
            }
        } catch (error: any) {
            setGeneralError(error?.message ?? String(error))
        } finally {
            setSubmitting(false)
        }
    }, [isBatch, isPending, labels.validationFailed, onSubmit, rows, submitting, values])

    // Enter: single forms submit; batch forms never submit (a grid needs fast
    // row-to-row entry). In a batch cell Enter jumps to the SAME column of the
    // next row; textarea keeps its newline, IME compositions and the Radix
    // widgets' own keys are left untouched, and Tab stays native.
    const handleFormKeyDown = (event: React.KeyboardEvent<HTMLFormElement>) => {
        if (event.key !== 'Enter' || isImeComposing(event)) return
        const target = event.target as HTMLElement | null
        if (!target) return
        const tag = target.tagName.toLowerCase()
        if (tag === 'textarea' || tag === 'button') return
        if (target.getAttribute('role') === 'combobox'
            || target.closest('[role="listbox"], [role="option"]')) return
        event.preventDefault()
        if (isBatch) {
            const cellKey = target.getAttribute('data-cell')
            if (!cellKey) return
            const separator = cellKey.indexOf(':')
            if (separator < 0) return
            const rowIndex = Number(cellKey.slice(0, separator))
            const fieldKey = cellKey.slice(separator + 1)
            if (!Number.isFinite(rowIndex)) return
            event.currentTarget
                .querySelector<HTMLElement>(`[data-cell="${rowIndex + 1}:${fieldKey}"]`)
                ?.focus()
            return
        }
        void submit()
    }

    const inputId = (key: string) => `${baseId}-${key}`
    const rowInputId = (rowIndex: number, key: string) => `${baseId}-r${rowIndex}-${key}`

    const finishedAt = request.answeredAt ?? request.cancelledAt ?? Date.now()
    const statusLabel = request.status === 'answered'
        ? (labels.answered ?? DEFAULT_LABELS.answered)
        : request.status === 'cancelled'
            ? (labels.cancelled ?? DEFAULT_LABELS.cancelled)
            : (labels.pending ?? DEFAULT_LABELS.pending)
    const emptyValue = labels.emptyValue ?? DEFAULT_LABELS.emptyValue

    const header = (
        <div className="flex items-start gap-2">
            <div
                className={cn(
                    'shrink-0 rounded-md p-1.5',
                    isPending ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                )}
            >
                <ClipboardList className="h-3.5 w-3.5" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
                <p className="text-xs font-medium leading-snug text-foreground" title={request.title}>
                    {request.title}
                </p>
                {request.description && (
                    <p className="mt-0.5 line-clamp-3 text-[10px] leading-snug text-muted-foreground">
                        {request.description}
                    </p>
                )}
                {isBatch && isPending && (
                    <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground/80">
                        {labels.batchHint ?? `表格填写：${batch!.minRows}–${batch!.maxRows} 条，Enter 跳到下一行`}
                    </p>
                )}
                {!isPending && (
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Badge
                            variant="secondary"
                            className={cn(
                                'h-4 gap-0.5 px-1.5 text-[10px] font-medium',
                                request.status === 'answered'
                                    ? 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400'
                                    : 'text-muted-foreground',
                            )}
                        >
                            {request.status === 'answered'
                                ? <CheckCircle2 className="h-2.5 w-2.5" aria-hidden />
                                : <CircleSlash className="h-2.5 w-2.5" aria-hidden />}
                            {statusLabel}
                        </Badge>
                        <span
                            className="text-[10px] text-muted-foreground/70"
                            title={new Date(finishedAt).toLocaleString('zh-CN')}
                        >
                            {formatFormRelativeTime(finishedAt)}
                        </span>
                    </div>
                )}
            </div>
        </div>
    )

    // ─── Read-only summary (answered / cancelled) ──────────────────
    if (!isPending) {
        const answered = request.status === 'answered'
        const rowGroups = answered && isBatch && request.rows ? request.rows : []
        return (
            <div
                className={cn('rounded-lg border border-border/60 bg-card p-2.5 shadow-sm', className)}
                role="group"
                aria-label={request.title}
            >
                {header}
                {answered && !isBatch && (
                    <dl className="mt-2 space-y-1">
                        {request.fields.map(field => (
                            <div key={field.key} className="flex gap-2 text-[11px] leading-snug">
                                <dt className="w-20 shrink-0 truncate text-muted-foreground" title={field.label}>
                                    {field.label}
                                </dt>
                                <dd className="min-w-0 flex-1 break-words text-foreground/80">
                                    {formatFieldValue(field, request.values?.[field.key], emptyValue)}
                                </dd>
                            </div>
                        ))}
                    </dl>
                )}
                {answered && isBatch && rowGroups.length > 0 && (
                    <div className="mt-2 max-h-[min(55vh,420px)] overflow-x-auto overflow-y-auto rounded-md border">
                        <Table className="w-full text-xs" aria-label={request.title}>
                            <TableHeader className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-background">
                                <TableRow>
                                    <TableHead className="w-10 px-1 text-center text-[10px]">
                                        {labels.rowNumber ?? '#'}
                                    </TableHead>
                                    {request.fields.map(field => (
                                        <TableHead
                                            key={field.key}
                                            className={cn(
                                                'h-9 whitespace-nowrap text-[11px]',
                                                BATCH_COLUMN_WIDTH[field.type],
                                            )}
                                        >
                                            {field.label}
                                        </TableHead>
                                    ))}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {rowGroups.map((row, index) => (
                                    <TableRow key={index}>
                                        <TableCell
                                            className="px-1 text-center align-top text-[10px] tabular-nums text-muted-foreground"
                                            title={labels.rowTitle?.(index)}
                                        >
                                            {index + 1}
                                        </TableCell>
                                        {request.fields.map(field => (
                                            <TableCell
                                                key={field.key}
                                                className="whitespace-pre-wrap break-words align-top text-[11px] text-foreground/80"
                                            >
                                                {formatFieldValue(field, row[field.key], emptyValue)}
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
                {request.status === 'cancelled' && (
                    <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
                        {`${labels.cancelReason ?? DEFAULT_LABELS.cancelReason}：${request.cancelReason ?? emptyValue}`}
                    </p>
                )}
                {request.waitExpiredAt && (
                    <p className="mt-2 text-[10px] leading-snug text-amber-600 dark:text-amber-400">
                        {labels.waitExpired ?? DEFAULT_LABELS.waitExpired}
                    </p>
                )}
            </div>
        )
    }

    // ─── Editable form (pending) ───────────────────────────────────
    const batchCount = batch ? rows.length : 0
    const batchContent = isBatch && batch ? (
        <div className="space-y-2">
            {/* Table: columns are fields, rows are records. Horizontal scroll for
                many/wide fields, vertical scroll with a sticky header for many
                records; Enter moves down a column (see handleFormKeyDown). */}
            <div className="max-h-[min(55vh,420px)] overflow-x-auto overflow-y-auto rounded-md border">
                <Table className="w-full text-xs" aria-label={request.title}>
                    <TableHeader className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-background">
                        <TableRow>
                            <TableHead className="w-10 px-1 text-center text-[10px]">
                                {labels.rowNumber ?? '#'}
                            </TableHead>
                            {request.fields.map(field => (
                                <TableHead
                                    key={field.key}
                                    className={cn(
                                        'h-9 whitespace-nowrap px-2 text-[11px]',
                                        BATCH_COLUMN_WIDTH[field.type],
                                    )}
                                >
                                    <span className="flex items-center gap-0.5">
                                        <span className="truncate">{field.label}</span>
                                        {field.required && (
                                            <span
                                                aria-hidden
                                                title={labels.required}
                                                className="text-destructive"
                                            >
                                                *
                                            </span>
                                        )}
                                    </span>
                                    {field.description && (
                                        <span className="block max-w-[220px] truncate text-[10px] font-normal text-muted-foreground/80">
                                            {field.description}
                                        </span>
                                    )}
                                </TableHead>
                            ))}
                            <TableHead className="w-10 px-1 text-center text-[10px]">
                                <span className="sr-only">
                                    {labels.removeRow ?? DEFAULT_LABELS.removeRow}
                                </span>
                            </TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.map((row, rowIndex) => (
                            <TableRow key={row.id} className="align-top">
                                <TableCell
                                    className="px-1 pt-2 text-center text-[10px] tabular-nums text-muted-foreground"
                                    title={labels.rowTitle?.(rowIndex)}
                                >
                                    {rowIndex + 1}
                                </TableCell>
                                {request.fields.map(field => (
                                    <TableCell key={field.key} className="px-1.5 py-1.5 align-top">
                                        {renderBatchCell({
                                            field,
                                            value: row.values[field.key],
                                            id: rowInputId(rowIndex, field.key),
                                            cellKey: `${rowIndex}:${field.key}`,
                                            error: fieldErrors[`${rowIndex}.${field.key}`],
                                            onChange: next => setRowValue(rowIndex, field.key, next),
                                            labels,
                                        })}
                                    </TableCell>
                                ))}
                                <TableCell className="px-1 pt-2 text-center align-top">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 w-7 p-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                        disabled={rows.length <= batch.minRows}
                                        aria-label={`${labels.removeRow ?? DEFAULT_LABELS.removeRow} ${rowIndex + 1}`}
                                        onClick={() => removeRow(rowIndex)}
                                    >
                                        <Trash2 className="h-3 w-3" aria-hidden />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 w-fit text-xs"
                    disabled={rows.length >= batch.maxRows}
                    onClick={addRow}
                >
                    <Plus className="mr-1 h-3 w-3" aria-hidden />
                    {batch.addLabel || labels.addRow || DEFAULT_LABELS.addRow}
                </Button>
                {rows.length >= batch.maxRows && (
                    <span className="text-[10px] leading-snug text-muted-foreground">
                        {labels.batchLimit ?? `已达 ${batch.maxRows} 行上限`}
                    </span>
                )}
            </div>
        </div>
    ) : null

    return (
        <div
            className={cn('rounded-lg border border-border/60 bg-card p-2.5 shadow-sm', className)}
            role="group"
            aria-label={request.title}
        >
            {header}

            <form
                className="mt-2.5 space-y-2"
                aria-label={request.title}
                noValidate
                onSubmit={event => {
                    event.preventDefault()
                    void submit()
                }}
                onKeyDown={handleFormKeyDown}
            >
                {isBatch && batch ? batchContent : (
                    <FieldGroup className="gap-2">
                        {request.fields.map(field => renderField({
                            field,
                            value: values[field.key],
                            id: inputId(field.key),
                            error: fieldErrors[field.key],
                            onChange: next => setSingleValue(field.key, next),
                            labels,
                        }))}
                    </FieldGroup>
                )}

                <FieldError className="text-[10px]">{generalError}</FieldError>

                {request.waitExpiredAt && (
                    <p className="text-[10px] leading-snug text-amber-600 dark:text-amber-400">
                        {labels.waitExpired ?? DEFAULT_LABELS.waitExpired}
                    </p>
                )}

                <FieldSeparator className="my-0" />

                <div className="flex flex-wrap items-center justify-end gap-1.5">
                    {request.allowCancel && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={onCancel}
                            disabled={submitting}
                            className="text-[11px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        >
                            <XCircle className="mr-1 h-3 w-3" aria-hidden />
                            {labels.cancel ?? DEFAULT_LABELS.cancel}
                        </Button>
                    )}
                    <Button type="submit" size="sm" disabled={submitting} className="text-xs">
                        {submitting
                            ? <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden />
                            : <Send className="mr-1 h-3 w-3" aria-hidden />}
                        {submitting
                            ? (labels.submitting ?? DEFAULT_LABELS.submitting)
                            : (request.submitLabel || labels.submit || DEFAULT_LABELS.submit)}
                        {isBatch && batchCount > 0 && (
                            <span className="ml-1 tabular-nums opacity-80">{batchCount} 条</span>
                        )}
                    </Button>
                </div>
            </form>
        </div>
    )
}