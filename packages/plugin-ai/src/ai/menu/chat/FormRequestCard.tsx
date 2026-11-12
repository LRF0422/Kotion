/**
 * Adapter: kernel form registry → shared `@kn/ui` AgentFormCard.
 *
 * The card itself (rendering, field kinds, batch rows, labels, read-only
 * summary) lives in `@kn/ui` so other surfaces can render the same form without
 * depending on the AI plugin. This file only does the two things that need the
 * registry:
 *
 *  - follow the live request (`useFormRequest`) instead of the possibly stale
 *    prop, so an answer/cancel from the unified board flips the card in place;
 *  - validate with the kernel validators and submit/cancel through
 *    `formRequests`, mapping the registry result to the card's structural
 *    `AgentFormSubmitResult`.
 */

import React, { useMemo } from 'react'
import {
    DEFAULT_FORM_BATCH_MAX_ROWS,
    formRequests,
    useFormRequest,
    useTranslation,
    validateFormRows,
    validateFormValues,
    type FormRequestView,
} from '@kn/common'
import {
    AgentFormCard,
    type AgentFormCardLabels,
    type AgentFormRequest,
    type AgentFormSubmitPayload,
    type AgentFormSubmitResult,
} from '@kn/ui'

export interface FormRequestCardProps {
    /** The request to render; the live registry view is preferred when available. */
    request: FormRequestView
    /** Called after a successful submit, with the answered request. */
    onSubmitted?: (request: FormRequestView) => void
    /** Extra classes for the card shell (the board strips the border/margins). */
    className?: string
}

/**
 * Structural mapping to the ui card's mirror type.
 *
 * Arrays/objects are passed by reference (the request definition is immutable),
 * so the card's draft-reset effect only keys on the request id, not on this
 * object's identity.
 */
const toAgentFormRequest = (view: FormRequestView): AgentFormRequest => ({
    id: view.id,
    title: view.title,
    ...(view.description ? { description: view.description } : {}),
    ...(view.submitLabel ? { submitLabel: view.submitLabel } : {}),
    allowCancel: view.allowCancel,
    status: view.status,
    fields: view.fields,
    ...(view.batch ? { batch: view.batch } : {}),
    ...(view.values ? { values: view.values as Record<string, unknown> } : {}),
    ...(view.rows ? { rows: view.rows as Array<Record<string, unknown>> } : {}),
    ...(view.answeredAt !== undefined ? { answeredAt: view.answeredAt } : {}),
    ...(view.cancelledAt !== undefined ? { cancelledAt: view.cancelledAt } : {}),
    ...(view.cancelReason ? { cancelReason: view.cancelReason } : {}),
    ...(view.waitExpiredAt !== undefined ? { waitExpiredAt: view.waitExpiredAt } : {}),
})

/** One dynamic form: registry-backed validation/submit around the shared card. */
export const FormRequestCard: React.FC<FormRequestCardProps> = ({
    request,
    onSubmitted,
    className,
}) => {
    const { t } = useTranslation()
    const liveRequest = useFormRequest(request.id)
    const view = liveRequest ?? request

    const labels = useMemo<AgentFormCardLabels>(() => ({
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
        waitExpired: t('ai.chat.forms.waitExpiredHint', {
            defaultValue: 'agent 已停止等待，现在填写仍会作为通知送回会话。',
        }),
        selectPlaceholder: t('ai.chat.forms.selectPlaceholder', { defaultValue: '请选择' }),
        emptyValue: t('ai.chat.forms.emptyValue', { defaultValue: '（空）' }),
        validationFailed: t('ai.chat.forms.validationFailed', {
            defaultValue: '请检查标红的字段后再提交。',
        }),
    }), [t])

    const handleSubmit = (payload: AgentFormSubmitPayload): AgentFormSubmitResult => {
        if (payload.kind === 'batch') {
            // The registry also validates, but doing it first keeps the returned
            // `"rowIndex.fieldKey"` errors identical to the single-form path.
            const batch = view.batch ?? {
                minRows: 1,
                maxRows: DEFAULT_FORM_BATCH_MAX_ROWS,
                defaultRows: 1,
            }
            const validation = validateFormRows(view.fields, payload.rows, batch)
            if (!validation.ok) {
                return { ok: false, error: validation.error, fieldErrors: validation.fieldErrors }
            }
            const result = formRequests.submit(view.id, validation.rows)
            if (!result.ok) {
                return { ok: false, error: result.error, fieldErrors: result.fieldErrors }
            }
            onSubmitted?.(result.request)
            return { ok: true }
        }

        const validation = validateFormValues(view.fields, payload.values)
        if (!validation.ok) {
            return { ok: false, error: validation.error, fieldErrors: validation.fieldErrors }
        }
        const result = formRequests.submit(view.id, validation.values)
        if (!result.ok) {
            return { ok: false, error: result.error, fieldErrors: result.fieldErrors }
        }
        onSubmitted?.(result.request)
        return { ok: true }
    }

    const handleCancel = () => {
        formRequests.cancel(view.id, t('ai.chat.forms.cancelReason', {
            defaultValue: '用户取消了填写',
        }))
    }

    return (
        <AgentFormCard
            request={toAgentFormRequest(view)}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            labels={labels}
            className={className}
        />
    )
}