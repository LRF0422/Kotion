import { useMemo } from 'react'
import { useTranslation } from '@kn/common'
import type {
    AgentFormBatchSpec,
    AgentFormCardLabels,
    FormRelativeTimeLabels,
} from '@kn/ui'

/**
 * Localized copy for the dynamic-form surfaces (the inbox board and the card).
 *
 * `@kn/ui` cannot import `@kn/common`, so `AgentFormCard` / formatFormRelativeTime
 * take their wording as props (Chinese defaults). Every form surface in the AI
 * plugin goes through these two hooks so the same key set is mapped exactly once
 * — the card is rendered from the conversation, the inbox board and (later) any
 * other host, and they must not drift apart.
 */

/** i18n language → BCP-47 tag for absolute dates (`zh` → `zh-CN`, `en` → `en-US`). */
const localeTag = (language: string | undefined): string => {
    const base = (language ?? '').split('-')[0]
    if (base === 'zh') return 'zh-CN'
    if (base === 'en') return 'en-US'
    return language || 'en-US'
}

/** "刚刚" / "3 分钟前" wording, shared by the card header and the inbox rows. */
export function useFormRelativeTimeLabels(): FormRelativeTimeLabels {
    const { t, i18n } = useTranslation()
    const language = i18n.language

    return useMemo<FormRelativeTimeLabels>(() => ({
        locale: localeTag(language),
        justNow: t('ai.chat.forms.relativeTime.justNow', { defaultValue: '刚刚' }),
        minutesAgo: (count: number) => t('ai.chat.forms.relativeTime.minutesAgo', {
            count,
            defaultValue: '{{count}} 分钟前',
        }),
        hoursAgo: (count: number) => t('ai.chat.forms.relativeTime.hoursAgo', {
            count,
            defaultValue: '{{count}} 小时前',
        }),
        daysAgo: (count: number) => t('ai.chat.forms.relativeTime.daysAgo', {
            count,
            defaultValue: '{{count}} 天前',
        }),
    }), [t, language])
}

/**
 * Labels for {@link AgentFormCard}.
 *
 * `batch` only affects the two table hints (they embed the host-declared row
 * bounds), so pass the request's batch spec when there is one.
 */
export function useFormCardLabels(batch?: AgentFormBatchSpec | null): AgentFormCardLabels {
    const { t } = useTranslation()
    const relativeTime = useFormRelativeTimeLabels()
    const minRows = batch?.minRows
    const maxRows = batch?.maxRows

    return useMemo<AgentFormCardLabels>(() => ({
        ...(minRows !== undefined && maxRows !== undefined
            ? {
                batchHint: t('ai.chat.forms.batchHint', {
                    min: minRows,
                    max: maxRows,
                    defaultValue: '表格填写：{{min}}–{{max}} 条，Enter 跳到下一行',
                }),
                batchLimit: t('ai.chat.forms.batchLimit', {
                    max: maxRows,
                    defaultValue: '已达 {{max}} 行上限',
                }),
            }
            : {}),
        submit: t('ai.chat.forms.submit', { defaultValue: '提交' }),
        submitting: t('ai.chat.forms.submitting', { defaultValue: '提交中…' }),
        cancel: t('ai.chat.forms.cancel', { defaultValue: '取消' }),
        addRow: t('ai.chat.forms.addRow', { defaultValue: '添加一条' }),
        removeRow: t('ai.chat.forms.removeRow', { defaultValue: '删除' }),
        required: t('ai.chat.forms.required', { defaultValue: '必填' }),
        pending: t('ai.chat.forms.statusPending', { defaultValue: '待填写' }),
        answered: t('ai.chat.forms.statusAnswered', { defaultValue: '已填写' }),
        cancelled: t('ai.chat.forms.statusCancelled', { defaultValue: '已取消' }),
        cancelReason: t('ai.chat.forms.cancelReasonLabel', { defaultValue: '取消原因' }),
        labelSeparator: t('ai.chat.forms.labelSeparator', { defaultValue: '：' }),
        waitExpired: t('ai.chat.forms.waitExpiredHint', {
            defaultValue: 'agent 已停止等待，现在填写仍会作为通知送回会话。',
        }),
        selectPlaceholder: t('ai.chat.forms.selectPlaceholder', { defaultValue: '请选择' }),
        emptyValue: t('ai.chat.forms.emptyValue', { defaultValue: '（空）' }),
        validationFailed: t('ai.chat.forms.validationFailed', {
            defaultValue: '请检查标红的字段后再提交。',
        }),
        yes: t('ai.chat.forms.yes', { defaultValue: '是' }),
        no: t('ai.chat.forms.no', { defaultValue: '否' }),
        listSeparator: t('ai.chat.forms.listSeparator', { defaultValue: '、' }),
        rowNumber: t('ai.chat.forms.rowNumber', { defaultValue: '#' }),
        multiSelectPlaceholder: t('ai.chat.forms.multiSelectPlaceholder', {
            defaultValue: '选择…',
        }),
        selectedCount: (count: number) => t('ai.chat.forms.selectedCount', {
            count,
            defaultValue: '已选 {{count}} 项',
        }),
        batchCellAria: (fieldLabel: string, rowNumber: number) => t(
            'ai.chat.forms.batchCellAria',
            { label: fieldLabel, row: rowNumber, defaultValue: '{{label}}（第 {{row}} 行）' },
        ),
        batchRowsCount: (count: number) => t('ai.chat.forms.batchRowsCount', {
            count,
            defaultValue: '{{count}} 条',
        }),
        relativeTime,
    }), [minRows, maxRows, relativeTime, t])
}