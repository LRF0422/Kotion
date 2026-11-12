/**
 * Dynamic forms: the contract the agent relies on.
 *
 *   - a form definition from the model is untrusted and normalized once, at the
 *     tool boundary (string-option shorthand, duplicate keys, bounds …);
 *   - submitted values are validated per field, and a required checkbox means
 *     `true` — `false` is a deliberate no, not an empty answer;
 *   - batch forms repeat one field set per record: empty rows are dropped, the
 *     answer is `rows` (never `values`), and a note numbers every record;
 *   - a waiter is the delivery path: a submitted answer reaches the parked tool
 *     call and is marked delivered, so the notification path cannot announce it
 *     twice;
 *   - a timed-out wait is NOT a failure: the form stays fillable and a later
 *     answer becomes a note, claimed exactly once;
 *   - capacity pressure drops seen terminals first, never a pending form and
 *     never an answer nobody has been shown yet;
 *   - the tools only ever see their own conversation's requests, and
 *     `requestUserForm` refuses to create a form where nothing can render it.
 *
 * Everything runs against the real registry and the real tools — no mocks of the
 * module under test.
 */

import { strict as assert } from 'node:assert'
import {
    DEFAULT_FORM_BATCH_MAX_ROWS,
    DEFAULT_FORM_WAIT_MS,
    FormRequestRegistry,
    MAX_FORM_BATCH_ROWS,
    MAX_FORM_FIELDS,
    MAX_FORM_TEXT_LENGTH,
    MAX_FORM_TITLE_CHARS,
    MAX_FORM_WAIT_MS,
    buildFormRequestNote,
    formRequests,
    formatFormFieldValue,
    groupFormRequests,
    normalizeFormRequestInput,
    registerFormRequestHost,
    resetFormRequestHost,
    sortFormRequests,
    validateFormRows,
    validateFormValues,
} from './form-requests'
import type { FormBatchSpec, FormField, FormRequestInput, FormRequestView } from './form-requests'
import { createFormTools } from '../tools/form-tools'

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

/** A valid, normalized definition — or a loud failure, not a silently weird test. */
const expectInput = (raw: unknown): FormRequestInput => {
    const result: any = normalizeFormRequestInput(raw)
    if (result.error) throw new Error(`expected a valid form: ${result.error}`)
    return result.input as FormRequestInput
}

const expectNormalizeError = (raw: unknown, pattern: RegExp): string => {
    const result: any = normalizeFormRequestInput(raw)
    assert.ok(result.error, `must reject: ${JSON.stringify(raw)}`)
    assert.match(result.error, pattern)
    return result.error
}

/** A valid form with two fields, used wherever the content does not matter. */
const simpleSpec = (title = '示例表单') => ({
    title,
    fields: [
        { key: 'name', label: '姓名', type: 'text', required: true },
        { key: 'note', label: '备注', type: 'text' },
    ],
})

/**
 * Board helpers are pure over views: pin the clocks so order assertions do not
 * depend on how many milliseconds the event loop happened to take.
 */
const fakeView = (overrides: Partial<FormRequestView> & { id: string; title: string }): FormRequestView => ({
    fields: [],
    allowCancel: true,
    status: 'pending',
    createdAt: 0,
    ...overrides,
} as FormRequestView)

/* ------------------------------------------------------------------ *
 * Normalization
 * ------------------------------------------------------------------ */

function checkNormalize(): void {
    // Plain-string options are the shorthand a model reaches for.
    const shorthand = expectInput({
        title: '发布信息',
        fields: [
            { key: 'version', label: '版本号', type: 'text', required: true },
            { key: 'channel', label: '发布通道', type: 'select', options: ['stable', 'beta'] },
        ],
    })
    assert.equal(shorthand.allowCancel, true, 'cancelling is allowed unless it is refused')
    assert.deepEqual(shorthand.fields[1].options, [
        { value: 'stable', label: 'stable' },
        { value: 'beta', label: 'beta' },
    ])
    assert.equal(shorthand.fields[0].required, true)

    // `type` defaults to text; `allowCancel: false` is respected.
    const defaults = expectInput({ title: 't', allowCancel: false, fields: [{ key: 'name' }] })
    assert.equal(defaults.fields[0].type, 'text')
    assert.equal(defaults.fields[0].label, 'name', 'a missing label falls back to the key')
    assert.equal(defaults.allowCancel, false)

    // Duplicate keys would make the answers ambiguous.
    expectNormalizeError({
        title: 't',
        fields: [
            { key: 'dup', label: 'A' },
            { key: 'dup', label: 'B' },
        ],
    }, /重复/)

    // Unknown field types are rejected, not coerced to text.
    expectNormalizeError(
        { title: 't', fields: [{ key: 'file', label: '附件', type: 'file' }] },
        /不支持/,
    )

    // Choice fields must declare options.
    expectNormalizeError(
        { title: 't', fields: [{ key: 'channel', label: '通道', type: 'select' }] },
        /至少一个选项/,
    )

    // The field count is bounded.
    const tooMany = Array.from({ length: MAX_FORM_FIELDS + 1 }, (_entry, index) => ({
        key: `f${index}`,
        label: `字段 ${index}`,
    }))
    expectNormalizeError({ title: 't', fields: tooMany }, new RegExp(`最多 ${MAX_FORM_FIELDS} 个字段`))

    // A title is required and bounded.
    expectNormalizeError({ fields: [{ key: 'a', label: 'A' }] }, /缺少 title/)
    expectNormalizeError(
        { title: 'x'.repeat(MAX_FORM_TITLE_CHARS + 1), fields: [{ key: 'a', label: 'A' }] },
        /title 过长/,
    )
}

/** Batch mode: one field set, repeated per record (批量填写). */
function checkNormalizeBatch(): void {
    // `batch: true` turns on the defaults.
    const enabled = expectInput({
        title: '批量成员',
        batch: true,
        fields: [{ key: 'name', label: '姓名', type: 'text', required: true }],
    })
    assert.deepEqual(enabled.batch, {
        minRows: 1,
        maxRows: DEFAULT_FORM_BATCH_MAX_ROWS,
        defaultRows: 1,
    })

    // An object customizes the bounds and the UI nouns.
    const custom = expectInput({
        title: '批量成员',
        batch: { minRows: 2, maxRows: 5, defaultRows: 3, rowLabel: '成员', addLabel: '添加成员' },
        fields: [{ key: 'name', label: '姓名', type: 'text' }],
    })
    assert.deepEqual(custom.batch, {
        minRows: 2,
        maxRows: 5,
        defaultRows: 3,
        rowLabel: '成员',
        addLabel: '添加成员',
    })

    // Absurd bounds are clamped, not trusted: the model may pass anything.
    const clamped = expectInput({
        title: '批量成员',
        batch: { minRows: 0, maxRows: 999 },
        fields: [{ key: 'name', label: '姓名', type: 'text' }],
    })
    assert.equal(clamped.batch?.minRows, 1)
    assert.equal(clamped.batch?.maxRows, MAX_FORM_BATCH_ROWS)
    assert.equal(clamped.batch?.defaultRows, 1, 'defaultRows falls back to minRows')

    // defaultRows is clamped into [minRows, maxRows].
    const highDefault = expectInput({
        title: '批量成员',
        batch: { minRows: 3, maxRows: 4, defaultRows: 99 },
        fields: [{ key: 'name', label: '姓名', type: 'text' }],
    })
    assert.equal(highDefault.batch?.defaultRows, 4)

    // minRows > maxRows would make the form impossible to submit.
    expectNormalizeError(
        { title: 't', batch: { minRows: 5, maxRows: 2 }, fields: [{ key: 'a', label: 'A' }] },
        /minRows（5）不能大于 maxRows（2）/,
    )

    // `false` / absent means a single-record form; a bad shape is rejected.
    assert.equal(expectInput({ title: 't', batch: false, fields: [{ key: 'a', label: 'A' }] }).batch, undefined)
    assert.equal(expectInput({ title: 't', fields: [{ key: 'a', label: 'A' }] }).batch, undefined)
    expectNormalizeError(
        { title: 't', batch: 'yes', fields: [{ key: 'a', label: 'A' }] },
        /batch 需要是布尔值或对象/,
    )
}

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

const validationFields = (): FormField[] => expectInput({
    title: '校验表单',
    fields: [
        { key: 'name', label: '名字', type: 'text', required: true, minLength: 2, maxLength: 5 },
        { key: 'age', label: '年龄', type: 'number', min: 0, max: 120 },
        { key: 'tier', label: '档位', type: 'select', options: ['free', 'pro'] },
        { key: 'tags', label: '标签', type: 'multiselect', options: ['a', 'b', 'c'] },
        { key: 'agree', label: '同意', type: 'checkbox', required: true },
        { key: 'birthday', label: '生日', type: 'date' },
        { key: 'note', label: '备注', type: 'textarea', minLength: 3 },
    ],
}).fields

const validate = (values: unknown): any => validateFormValues(validationFields(), values)

function checkValidateRequiredAndBounds(): void {
    // Every failing field is reported, keyed by its field key.
    const empty = validate({})
    assert.equal(empty.ok, false)
    assert.deepEqual(Object.keys(empty.fieldErrors).sort(), ['agree', 'name'])
    assert.equal(empty.fieldErrors.name, '此项必填。')
    assert.equal(empty.fieldErrors.agree, '请勾选此项。')

    // A required checkbox is a confirmation: false is not an answer.
    const unchecked = validate({ name: 'ok', agree: false })
    assert.equal(unchecked.ok, false)
    assert.deepEqual(Object.keys(unchecked.fieldErrors), ['agree'])
    assert.equal(unchecked.fieldErrors.agree, '请勾选此项。')

    // text min/max length.
    assert.equal(validate({ name: 'a', agree: true }).fieldErrors.name, '至少 2 个字符。')
    assert.equal(validate({ name: 'abcdef', agree: true }).fieldErrors.name, '不能超过 5 个字符。')

    // An UNDECLARED max still has a global cap: one pasted document must not turn
    // a form answer into a context bomb.
    const unbounded: any = validateFormValues(
        [{ key: 'big', label: '大文本', type: 'text' }],
        { big: 'x'.repeat(MAX_FORM_TEXT_LENGTH + 1) },
    )
    assert.equal(unbounded.ok, false)
    assert.equal(unbounded.fieldErrors.big, `不能超过 ${MAX_FORM_TEXT_LENGTH} 个字符。`)

    // number bounds and non-finite / wrong-typed input.
    const tooBig = validate({ name: 'ok', agree: true, age: 121 })
    assert.equal(tooBig.ok, false)
    assert.match(tooBig.fieldErrors.age, /不能大于 120/)
    assert.match(validate({ name: 'ok', agree: true, age: -1 }).fieldErrors.age, /不能小于 0/)
    assert.equal(validate({ name: 'ok', agree: true, age: Number.NaN }).fieldErrors.age, '需要一个数字。')
    assert.equal(validate({ name: 'ok', agree: true, age: '12' }).fieldErrors.age, '需要一个数字。')

    // Choice values must be declared options.
    assert.equal(validate({ name: 'ok', agree: true, tier: 'enterprise' }).fieldErrors.tier, '不是可选项之一。')

    // multiselect: deduplicated on accept, unknown values rejected.
    const multi = validate({ name: 'ok', agree: true, tags: ['a', 'a', 'b'] })
    assert.equal(multi.ok, true)
    assert.deepEqual(multi.values.tags, ['a', 'b'])
    assert.equal(validate({ name: 'ok', agree: true, tags: ['a', 'z'] }).fieldErrors.tags, '包含不可选的选项。')

    // dates must be real calendar dates, not just the right shape.
    assert.equal(
        validate({ name: 'ok', agree: true, birthday: '2024-02-30' }).fieldErrors.birthday,
        '日期格式应为 YYYY-MM-DD。',
    )
    assert.equal(
        validate({ name: 'ok', agree: true, birthday: '2024/01/01' }).fieldErrors.birthday,
        '日期格式应为 YYYY-MM-DD。',
    )
    assert.equal(validate({ name: 'ok', agree: true, birthday: '2024-02-29' }).ok, true)

    // Unknown keys are ignored: the UI submits its whole state object.
    const clean = validate({ name: 'ok', agree: true, extra: 'ignored' })
    assert.equal(clean.ok, true)
    assert.equal(clean.values.extra, undefined)
    // Optional empties get their typed empty value, so the answer shape is stable.
    assert.deepEqual(clean.values.tags, [], 'an untouched multiselect is an empty array')
    assert.equal(clean.values.agree, true)
    // textarea minLength applies only when a value was provided.
    assert.equal(validate({ name: 'ok', agree: true, note: 'hi' }).fieldErrors.note, '至少 3 个字符。')
}

/* ------------------------------------------------------------------ *
 * Batch row validation
 * ------------------------------------------------------------------ */

/** The field set of a batch form, normalized once so row bounds are real. */
const batchFields = (): FormField[] => expectInput({
    title: '批量成员',
    batch: { minRows: 1, maxRows: 3, defaultRows: 2 },
    fields: [
        { key: 'name', label: '姓名', type: 'text', required: true },
        { key: 'age', label: '年龄', type: 'number', min: 0, max: 120 },
    ],
}).fields

const BATCH_SPEC: FormBatchSpec = { minRows: 1, maxRows: 3, defaultRows: 2 }
const validateRows = (rows: unknown, spec: FormBatchSpec = BATCH_SPEC): any =>
    validateFormRows(batchFields(), rows, spec)

function checkValidateFormRows(): void {
    // Empty rows are ignored — the editor always leaves one blank row around.
    // (The array itself must still fit maxRows: that is the row-count bound.)
    const sparse = validateRows([
        { name: '张三', age: 30 },
        {},
        { name: '', age: null },
        { name: '李四' },
    ], { minRows: 1, maxRows: 5, defaultRows: 2 })
    assert.equal(sparse.ok, true)
    assert.deepEqual(
        sparse.rows,
        [{ name: '张三', age: 30 }, { name: '李四' }],
        'blank rows are dropped from the stored answer',
    )

    // A partially filled row is validated and reported at `rowIndex.fieldKey`.
    const partial = validateRows([{ name: '张三' }, { age: 30 }])
    assert.equal(partial.ok, false)
    assert.deepEqual(Object.keys(partial.fieldErrors), ['1.name'])
    assert.equal(partial.fieldErrors['1.name'], '此项必填。')
    assert.match(partial.error, /批量表单校验未通过/)

    // The row count bounds come from the batch spec.
    const tooFew = validateRows([{ name: '张三' }, {}], { minRows: 2, maxRows: 3, defaultRows: 2 })
    assert.equal(tooFew.ok, false)
    assert.match(tooFew.error, /至少填写 2 条记录（当前 1 条有效）/)
    const tooMany = validateRows(
        [{ name: 'a' }, { name: 'b' }, { name: 'c' }, { name: 'd' }],
        { minRows: 1, maxRows: 3, defaultRows: 1 },
    )
    assert.equal(tooMany.ok, false)
    assert.match(tooMany.error, /最多填写 3 条记录/)

    // Unknown keys are ignored; a non-object row is a hard error with its index.
    const unknownKey = validateRows([{ name: '张三', extra: 'ignored' }])
    assert.equal(unknownKey.ok, true)
    assert.equal(unknownKey.rows[0].extra, undefined)
    assert.match(validateRows('nope').error, /rows 数组/)
    assert.match(validateRows([{ name: 'ok' }, 'nope']).error, /第 2 条记录必须是对象/)
}

/* ------------------------------------------------------------------ *
 * Registry
 * ------------------------------------------------------------------ */

function checkRegistryCreateGet(): void {
    const registry = new FormRequestRegistry()
    const created = registry.create(simpleSpec('注册表表单'), {
        conversationId: 'c1',
        owner: 'sub-7',
        tool: 'requestUserForm',
    })
    assert.equal(created.status, 'pending')
    assert.equal(created.id, 'form-1')
    assert.equal(created.conversationId, 'c1')
    assert.equal(created.owner, 'sub-7')
    assert.equal(created.tool, 'requestUserForm')
    assert.equal(created.allowCancel, true)
    assert.equal(created.waitExpiredAt, undefined)

    // get returns a snapshot, never the registry's live object.
    const fetched = registry.get(created.id)!
    assert.notEqual(fetched, created)
    fetched.title = 'mutated'
    assert.equal(registry.get(created.id)?.title, '注册表表单')
    assert.equal(registry.get('form-999'), undefined)

    // Session scoping: null matches only requests with no conversation.
    const unowned = registry.create(simpleSpec('无会话表单'))
    assert.equal(unowned.conversationId, null)
    assert.equal(registry.list({ conversationId: 'c1' }).length, 1)
    assert.equal(registry.list({ conversationId: 'c2' }).length, 0)
    assert.equal(registry.list({ conversationId: null }).length, 1)
    assert.equal(registry.list().length, 2, 'no filter means everything')
}

/** `listSnapshot` must be referentially stable between changes (React compares). */
function checkListSnapshotIsStable(): void {
    const registry = new FormRequestRegistry()
    registry.create(simpleSpec('stable'), { conversationId: 'c1' })
    const first = registry.listSnapshot({ conversationId: 'c1' })
    const second = registry.listSnapshot({ conversationId: 'c1' })
    assert.equal(first, second, 'same version must return the same array identity')

    const created = registry.create(simpleSpec('newer'), { conversationId: 'c1' })
    const third = registry.listSnapshot({ conversationId: 'c1' })
    assert.notEqual(first, third, 'a create changes the snapshot')
    assert.equal(third.length, 2)
    assert.equal(third, registry.listSnapshot({ conversationId: 'c1' }), 'and it is stable again')

    // A lifecycle change (not just a create) invalidates the cache too.
    assert.equal(registry.submit(created.id, { name: 'ok' }).ok, true)
    const fourth = registry.listSnapshot({ conversationId: 'c1' })
    assert.notEqual(third, fourth, 'an answer changes the snapshot')
    const answeredView = fourth.find(view => view.id === created.id)
    assert.ok(answeredView && 'values' in answeredView, 'the snapshot carries the answer')
}

/* ------------------------------------------------------------------ *
 * Waiting / delivery
 * ------------------------------------------------------------------ */

async function checkWaitSubmitDelivers(): Promise<void> {
    const registry = new FormRequestRegistry()
    const request = registry.create(simpleSpec('等待表单'), { conversationId: 'c1' })

    const waiting = registry.wait(request.id, 5_000)
    assert.equal(registry.get(request.id)?.status, 'pending', 'the wait must not settle on its own')
    assert.equal(registry.submit(request.id, { name: '张三' }).ok, true)

    const outcome = await waiting
    assert.equal(outcome.timedOut, false)
    assert.equal(outcome.request?.status, 'answered')
    assert.deepEqual(outcome.request?.values, { name: '张三' })
    assert.equal(outcome.request?.deliveredAt !== undefined, true, 'a parked waiter IS the delivery')
    // The waiter consumed the answer: no note should follow it.
    assert.deepEqual(registry.undelivered('c1'), [])
    assert.deepEqual(registry.takeUndelivered('c1'), [])
}

/** A batch answer is `rows`, delivered and described per record. */
async function checkBatchSubmitStoresRows(): Promise<void> {
    const registry = new FormRequestRegistry()
    const request = registry.create({
        title: '批量成员',
        batch: { minRows: 1, maxRows: 5, defaultRows: 2, rowLabel: '成员' },
        fields: [{ key: 'name', label: '姓名', type: 'text', required: true }],
    }, { conversationId: 'c-batch' })
    // The registry has to keep the spec: submit() branches on it.
    assert.equal(request.batch?.maxRows, 5, 'create must carry the batch spec into the view')

    const waiting = registry.wait(request.id, 5_000)
    assert.equal(registry.submit(request.id, [{ name: '张三' }, {}, { name: '李四' }]).ok, true)

    const answered = registry.get(request.id)!
    assert.equal(answered.status, 'answered')
    assert.equal(answered.values, undefined, 'a batch answer lives in rows, not values')
    assert.deepEqual(answered.rows, [{ name: '张三' }, { name: '李四' }], 'empty rows are dropped at submit')
    assert.equal(answered.batch?.rowLabel, '成员')

    // A parked waiter is the delivery path.
    const outcome = await waiting
    assert.equal(outcome.request?.status, 'answered')
    assert.deepEqual(outcome.request?.rows, answered.rows)
    assert.deepEqual(registry.takeUndelivered('c-batch'), [])

    // The note numbers every record for the transcript.
    const note = buildFormRequestNote([answered])
    assert.match(note, /共 2 条/)
    assert.match(note, /第 1 条：姓名：张三/)
    assert.match(note, /第 2 条：姓名：李四/)

    // Nobody parked → the answer stays claimable and describe() reads the same rows.
    const late = registry.create({
        title: '批量名单',
        batch: true,
        fields: [{ key: 'name', label: '姓名', type: 'text', required: true }],
    }, { conversationId: 'c-batch' })
    assert.equal(registry.submit(late.id, [{ name: '王五' }]).ok, true)
    const claimed = registry.takeUndelivered('c-batch')
    assert.equal(claimed.length, 1)
    assert.deepEqual(claimed[0].rows, [{ name: '王五' }])
    assert.match(registry.describe(claimed), /第 1 条/)
}

async function checkWaitTimeoutKeepsPending(): Promise<void> {
    const registry = new FormRequestRegistry()
    const request = registry.create(simpleSpec('超时表单'), { conversationId: 'c1' })

    const outcome = await registry.wait(request.id, 20)
    assert.equal(outcome.timedOut, true, 'a wait that expires reports the timeout')
    assert.equal(outcome.request?.status, 'pending', 'and the request itself is untouched')
    assert.equal(typeof outcome.request?.waitExpiredAt, 'number', 'the expiry is recorded for the UI')
    assert.deepEqual(registry.undelivered('c1'), [], 'nothing has been answered yet')

    // Answering after the timeout still reaches the conversation — once.
    assert.equal(registry.submit(request.id, { name: '迟到' }).ok, true)
    const claimed = registry.takeUndelivered('c1')
    assert.equal(claimed.length, 1, 'the late answer is still deliverable')
    assert.deepEqual(claimed[0].values, { name: '迟到' })
    assert.deepEqual(registry.takeUndelivered('c1'), [], 'claiming is exactly once')
}

async function checkConsumeConsumesAnswered(): Promise<void> {
    const registry = new FormRequestRegistry()
    const request = registry.create(simpleSpec('消费表单'), { conversationId: 'c1' })
    assert.equal(registry.submit(request.id, { name: '已填' }).ok, true)
    assert.equal(registry.undelivered('c1').length, 1, 'nobody was parked, so it is undelivered')

    const consumed = registry.consume(request.id)
    assert.equal(consumed?.status, 'answered')
    assert.deepEqual(consumed?.values, { name: '已填' })
    assert.deepEqual(registry.undelivered('c1'), [], 'reading an answer consumes it')
    assert.equal(registry.consume('form-999'), undefined, 'unknown ids are undefined, not thrown')

    // Waiting on an already-terminal request also counts as seeing the answer.
    const registry2 = new FormRequestRegistry()
    const second = registry2.create(simpleSpec('终态等待'), { conversationId: 'c1' })
    registry2.submit(second.id, { name: '早到' })
    const outcome = await registry2.wait(second.id, 100)
    assert.equal(outcome.timedOut, false)
    assert.equal(outcome.request?.status, 'answered')
    assert.deepEqual(registry2.takeUndelivered('c1'), [])
}

async function checkCancelSettlesWaiter(): Promise<void> {
    const registry = new FormRequestRegistry()
    const request = registry.create(simpleSpec('取消表单'), { conversationId: 'c1' })
    const waiting = registry.wait(request.id, 5_000)

    assert.equal(registry.cancel(request.id, '不需要了'), true)
    const outcome = await waiting
    assert.equal(outcome.timedOut, false, 'cancel unblocks a waiter instead of letting it time out')
    assert.equal(outcome.request?.status, 'cancelled')
    assert.equal(outcome.request?.cancelReason, '不需要了')
    assert.deepEqual(registry.undelivered('c1'), [], 'a cancelled form has no answer to announce')
    assert.deepEqual(registry.takeUndelivered('c1'), [])

    assert.equal(registry.cancel(request.id), false, 'a terminal request refuses a second cancel')
    assert.equal(registry.cancel('form-999'), false, 'unknown ids are refused, not thrown')
    assert.equal(registry.submit(request.id, { name: 'x' }).ok, false, 'a cancelled form rejects submissions')

    // The default reason is user-facing text, not undefined.
    const noReason = registry.create(simpleSpec('无理由取消'), { conversationId: 'c1' })
    assert.equal(registry.cancel(noReason.id), true)
    assert.equal(registry.get(noReason.id)?.cancelReason, '用户取消了填写')
}

/**
 * Capacity pressure evicts seen terminals first. A pending form (the user still
 * needs it) and an answer nobody has been shown (losing it means the agent is
 * never told) must both survive the noise.
 */
async function checkTrimKeepsPendingAndUndelivered(): Promise<void> {
    const registry = new FormRequestRegistry()

    // A seen terminal: the first thing capacity pressure should drop.
    const delivered = registry.create(simpleSpec('已经看过的'), { conversationId: 'c1' })
    const deliveredWait = registry.wait(delivered.id, 5_000)
    registry.submit(delivered.id, { name: 'seen' })
    await deliveredWait

    // An answer nobody claimed yet: it must outlive the noise.
    const unseen = registry.create(simpleSpec('未投递的答案'), { conversationId: 'c1' })
    registry.submit(unseen.id, { name: 'unseen' })

    // A pending form: the user may still fill it from the board.
    const pending = registry.create(simpleSpec('还在等用户'), { conversationId: 'c1' })

    for (let index = 0; index < 120; index += 1) {
        const noise = registry.create(simpleSpec(`noise ${index}`), { conversationId: 'c1' })
        registry.submit(noise.id, { name: `n${index}` })
        registry.consume(noise.id)
    }
    assert.ok(registry.list().length <= 100, 'terminal entries must be trimmed')
    assert.equal(registry.get(delivered.id), undefined, 'the oldest seen terminal is evicted first')
    assert.equal(
        registry.get(pending.id)?.status,
        'pending',
        'a pending request survives terminal noise',
    )
    assert.ok(
        registry.undelivered('c1').some(request => request.id === unseen.id),
        'an answer the agent has not seen must not be trimmed away',
    )
}

/* ------------------------------------------------------------------ *
 * Board helpers (pure)
 * ------------------------------------------------------------------ */

function checkBoardSortAndGroup(): void {
    const pending300 = fakeView({ id: 'form-1', title: 'pending 300', status: 'pending', createdAt: 300 })
    const pending100 = fakeView({ id: 'form-2', title: 'pending 100', status: 'pending', createdAt: 100 })
    const pendingTieA = fakeView({ id: 'form-3', title: 'pending tie a', status: 'pending', createdAt: 100 })
    const pendingTieB = fakeView({ id: 'form-4', title: 'pending tie b', status: 'pending', createdAt: 100 })
    const finishedOld = fakeView({
        id: 'form-5', title: 'finished 10k', status: 'answered', createdAt: 1, answeredAt: 10_000,
    })
    const finishedNew = fakeView({
        id: 'form-6', title: 'finished 30k', status: 'answered', createdAt: 2, answeredAt: 30_000,
    })
    const cancelledTie = fakeView({
        id: 'form-7', title: 'cancelled 20k', status: 'cancelled', createdAt: 3, cancelledAt: 20_000,
    })
    const finishedTie = fakeView({
        id: 'form-8', title: 'finished 20k', status: 'answered', createdAt: 4, answeredAt: 20_000,
    })

    // Input is deliberately mixed; equal clocks appear in the order shown here.
    const originalOrder = [
        'finished 10k',
        'pending 300',
        'finished 30k',
        'pending 100',
        'cancelled 20k',
        'pending tie a',
        'finished 20k',
        'pending tie b',
    ]
    const frozenInput = Object.freeze([
        finishedOld,
        pending300,
        finishedNew,
        pending100,
        cancelledTie,
        pendingTieA,
        finishedTie,
        pendingTieB,
    ])

    const sorted = sortFormRequests(frozenInput)
    assert.deepEqual(
        sorted.map(view => view.title),
        [
            'pending 100', // createdAt 100, input index 3
            'pending tie a', // createdAt 100, input index 5
            'pending tie b', // createdAt 100, input index 7
            'pending 300',
            'finished 30k',
            'cancelled 20k', // handled at 20k, input index 4
            'finished 20k', // handled at 20k, input index 6
            'finished 10k',
        ],
        'pending ascending by createdAt, finished descending by handling time, stable on ties',
    )
    assert.equal(sorted.length, frozenInput.length, 'sorting must not drop requests')
    assert.notEqual(sorted, frozenInput, 'sort must return a new array')
    // Frozen input proves the helper never sorts in place.
    assert.deepEqual(frozenInput.map(view => view.title), originalOrder, 'the input array keeps its order')

    const groups = groupFormRequests(frozenInput)
    assert.deepEqual(
        groups.pending.map(view => view.title),
        ['pending 100', 'pending tie a', 'pending tie b', 'pending 300'],
        'the pending section is oldest first',
    )
    assert.deepEqual(
        groups.finished.map(view => view.title),
        ['finished 30k', 'cancelled 20k', 'finished 20k', 'finished 10k'],
        'the finished section is most recently handled first',
    )
    assert.equal(
        groups.pending.length + groups.finished.length,
        frozenInput.length,
        'every request lands in exactly one section',
    )
    assert.ok(groups.pending.every(view => view.status === 'pending'))
    assert.ok(groups.finished.every(view => view.status !== 'pending'))
}

function checkBoardText(): void {
    const input = expectInput({
        title: '发布信息',
        fields: [
            { key: 'version', label: '版本号', type: 'text' },
            { key: 'channel', label: '发布通道', type: 'select', options: [{ value: 'beta', label: '灰度' }] },
            { key: 'grey', label: '是否灰度', type: 'checkbox' },
            {
                key: 'tags',
                label: '标签',
                type: 'multiselect',
                options: [{ value: 'a', label: '甲' }, { value: 'b', label: '乙' }],
            },
        ],
    })
    const [versionField, channelField, greyField, tagsField] = input.fields
    assert.equal(formatFormFieldValue(channelField, 'beta'), '灰度', 'select shows the option label')
    assert.equal(formatFormFieldValue(channelField, 'missing'), 'missing', 'and falls back to the raw value')
    assert.equal(formatFormFieldValue(greyField, true), '是')
    assert.equal(formatFormFieldValue(greyField, false), '否')
    assert.equal(formatFormFieldValue(tagsField, ['a', 'b']), '甲、乙', 'multiselect joins with the Chinese comma')
    assert.equal(formatFormFieldValue(tagsField, []), '（空）')
    assert.equal(formatFormFieldValue(versionField, undefined), '（空）')

    const note = buildFormRequestNote([
        fakeView({
            id: 'form-1',
            title: '发布信息',
            status: 'answered',
            fields: input.fields,
            values: { version: '1.2.0', channel: 'beta', grey: true, tags: ['a', 'b'] },
            createdAt: 1,
            answeredAt: 2,
        }),
    ])
    assert.match(note, /表单已填写/)
    assert.match(note, /发布信息/)
    assert.match(note, /form-1/)
    assert.match(note, /版本号：1\.2\.0/)
    assert.match(note, /发布通道：灰度/)
    assert.match(note, /是否灰度：是/)
    assert.match(note, /标签：甲、乙/)
}

/* ------------------------------------------------------------------ *
 * Tools
 * ------------------------------------------------------------------ */

const tools: any = createFormTools(undefined, undefined)

/** Every tool test needs an isolated registry and the host ref-count. */
const withFormHost = async (run: () => Promise<void>): Promise<void> => {
    formRequests.reset()
    resetFormRequestHost()
    const unregister = registerFormRequestHost()
    try {
        await run()
    } finally {
        unregister()
        formRequests.reset()
        resetFormRequestHost()
    }
}

/** No mounted form UI means no request and no five-minute park. */
async function checkToolRequiresHost(): Promise<void> {
    formRequests.reset()
    resetFormRequestHost()
    try {
        const result = await tools.requestUserForm.execute({
            title: '发布信息',
            fields: [{ key: 'version', label: '版本号', type: 'text' }],
        }, 'call-host', { conversationId: 'c-host' })

        assert.match(result.error, /没有挂载「填写请求」面板/)
        assert.match(result.hint, /文字/)
        assert.equal(formRequests.list().length, 0, 'a request must not exist where nothing can render it')
    } finally {
        formRequests.reset()
        resetFormRequestHost()
    }
}

async function checkToolRequestImmediate(): Promise<void> {
    await withFormHost(async () => {
        const startedAt = Date.now()
        const result = await tools.requestUserForm.execute({
            title: '发布信息',
            description: '填一下发布需要的字段',
            fields: [
                { key: 'version', label: '版本号', type: 'text', required: true },
                { key: 'channel', label: '发布通道', type: 'select', options: ['stable', 'beta'] },
            ],
            wait: false,
        }, 'call-immediate', { conversationId: 'c-form', owner: 'sub-1' })

        assert.equal(result.status, 'pending')
        assert.equal(result.waiting, false)
        assert.match(result.hint, /填写请求/)
        assert.ok(Date.now() - startedAt < 100, 'wait:false must return immediately')

        const stored = formRequests.get(result.formId)
        assert.equal(stored?.status, 'pending')
        assert.equal(stored?.title, '发布信息')
        assert.equal(stored?.conversationId, 'c-form')
        assert.equal(stored?.owner, 'sub-1')
        assert.equal(stored?.tool, 'requestUserForm')
    })
}

async function checkToolRequestWaitsForSubmit(): Promise<void> {
    await withFormHost(async () => {
        const waiting = tools.requestUserForm.execute({
            title: '发布信息',
            fields: [{ key: 'version', label: '版本号', type: 'text', required: true }],
            wait: true,
            timeoutMs: 2_000,
        }, 'call-wait', { conversationId: 'c-wait' })

        const [pendingView] = formRequests.list({ conversationId: 'c-wait', pendingOnly: true })
        assert.ok(pendingView, 'the form exists while the tool is parked')
        assert.equal(formRequests.submit(pendingView!.id, { version: '1.2.0' }).ok, true)

        const result = await waiting
        assert.equal(result.status, 'answered')
        assert.equal(result.formId, pendingView!.id)
        assert.deepEqual(result.values, { version: '1.2.0' })
        assert.equal(typeof result.answeredAt, 'number')
        assert.match(result.hint, /values/)
        assert.deepEqual(formRequests.takeUndelivered('c-wait'), [], 'the wait consumed the answer')
    })
}

async function checkToolRequestTimeout(): Promise<void> {
    await withFormHost(async () => {
        const result = await tools.requestUserForm.execute({
            title: '慢慢填',
            fields: [{ key: 'name', label: '姓名', type: 'text' }],
            timeoutMs: 20,
        }, 'call-timeout', { conversationId: 'c-timeout' })

        assert.equal(result.status, 'pending', 'a timeout is not a failure')
        assert.equal(result.timedOut, true)
        assert.match(result.hint, /不是失败/)
        const stored = formRequests.get(result.formId)
        assert.equal(stored?.status, 'pending')
        assert.equal(typeof stored?.waitExpiredAt, 'number')
    })
}

/** requestUserForm batch: the answer comes back as rows, not values. */
async function checkToolRequestBatchAnswered(): Promise<void> {
    await withFormHost(async () => {
        const waiting = tools.requestUserForm.execute({
            title: '批量成员',
            batch: { minRows: 1, maxRows: 5, defaultRows: 2, rowLabel: '成员' },
            fields: [{ key: 'name', label: '姓名', type: 'text', required: true }],
            wait: true,
            timeoutMs: 2_000,
        }, 'call-batch', { conversationId: 'c-batch' })

        const [pendingView] = formRequests.list({ conversationId: 'c-batch', pendingOnly: true })
        assert.equal(pendingView!.batch?.maxRows, 5, 'the batch spec must reach the view')
        assert.equal(formRequests.submit(pendingView!.id, [{ name: '张三' }, { name: '李四' }]).ok, true)

        const result = await waiting
        assert.equal(result.status, 'answered')
        assert.deepEqual(result.rows, [{ name: '张三' }, { name: '李四' }])
        assert.equal(result.rowCount, 2)
        assert.equal(result.values, undefined, 'batch answers never come back as values')
        assert.match(result.hint, /2 条/)
        assert.deepEqual(formRequests.takeUndelivered('c-batch'), [], 'the wait consumed the rows')
    })
}

/** get/list expose the batch spec and rows without leaking the payload into rows. */
async function checkToolGetAndListBatch(): Promise<void> {
    await withFormHost(async () => {
        // Pending batch: the spec is visible, but there is no answer yet.
        const created = await tools.requestUserForm.execute({
            title: '批量发布项',
            batch: true,
            fields: [{ key: 'name', label: '名称', type: 'text', required: true }],
            wait: false,
        }, 'call-b1', { conversationId: 'c-batch' })
        const pendingGet = await tools.getFormRequest.execute(
            { formId: created.formId, wait: false },
            'call-b2',
            { conversationId: 'c-batch' },
        )
        assert.equal(pendingGet.status, 'pending')
        assert.equal(pendingGet.batch?.maxRows, DEFAULT_FORM_BATCH_MAX_ROWS)
        assert.equal(pendingGet.rows, undefined)

        // Taken out of order, so the empty row is dropped at submit.
        assert.equal(formRequests.submit(created.formId, [{ name: 'A' }, { name: 'B' }, {}]).ok, true)
        const answered = await tools.getFormRequest.execute(
            { formId: created.formId, wait: false },
            'call-b3',
            { conversationId: 'c-batch' },
        )
        assert.equal(answered.status, 'answered')
        assert.deepEqual(answered.rows, [{ name: 'A' }, { name: 'B' }])
        assert.equal(answered.rowCount, 2)
        assert.equal(answered.values, undefined)
        assert.match(answered.hint, /2 条/)
        assert.deepEqual(formRequests.takeUndelivered('c-batch'), [], 'reading the answer consumes it')

        // The board row carries the batch flag and row count, never the rows.
        const listed = await tools.listFormRequests.execute({}, 'call-b4', { conversationId: 'c-batch' })
        assert.equal(listed.count, 1)
        const entry = listed.requests[0]
        assert.equal(entry.batch, true)
        assert.equal(entry.hasAnswers, true)
        assert.equal(entry.rowCount, 2)
        assert.equal(entry.rows, undefined, 'the list must not carry the answer payload')
        assert.match(listed.hint, /rows/)
    })
}

async function checkToolRejectsInvalidSpec(): Promise<void> {
    await withFormHost(async () => {
        const result = await tools.requestUserForm.execute({
            title: '坏表单',
            fields: [{ key: 'channel', label: '通道', type: 'select' }],
        }, 'call-bad', { conversationId: 'c-bad' })

        assert.match(result.error, /至少一个选项/)
        assert.match(result.hint, /修正字段/)
        assert.equal(formRequests.list().length, 0, 'an invalid definition must not create a request')
    })
}

async function checkToolGet(): Promise<void> {
    await withFormHost(async () => {
        // Unknown id and "nothing pending" are distinct, actionable errors.
        const unknown = await tools.getFormRequest.execute(
            { formId: 'form-999', wait: false },
            'call-g0',
            { conversationId: 'c-get' },
        )
        assert.match(unknown.error, /form-999/)
        const none = await tools.getFormRequest.execute({ wait: false }, 'call-g1', { conversationId: 'c-get' })
        assert.match(none.error, /没有待填写的表单/)

        const created = await tools.requestUserForm.execute({
            title: '取答案',
            fields: [{ key: 'name', label: '姓名', type: 'text' }],
            wait: false,
        }, 'call-g2', { conversationId: 'c-get' })

        // formId omitted: the session's only pending form is the obvious target.
        const implicit = await tools.getFormRequest.execute({ wait: false }, 'call-g3', { conversationId: 'c-get' })
        assert.equal(implicit.formId, created.formId)
        assert.equal(implicit.status, 'pending')
        assert.equal(implicit.values, undefined, 'pending requests carry no answers')
        assert.equal(formRequests.get(created.formId)?.deliveredAt, undefined, 'peeking at a pending form consumes nothing')

        // Two pending forms make the omission ambiguous: say which ids exist.
        const second = await tools.requestUserForm.execute({
            title: '第二张',
            fields: [{ key: 'x', label: 'X', type: 'text' }],
            wait: false,
        }, 'call-g4', { conversationId: 'c-get' })
        const ambiguous = await tools.getFormRequest.execute({ wait: false }, 'call-g5', { conversationId: 'c-get' })
        assert.match(ambiguous.error, /2 张/)
        assert.ok(ambiguous.error.includes(created.formId))
        assert.ok(ambiguous.error.includes(second.formId))

        // Answered: values come back, and a read consumes the answer.
        assert.equal(formRequests.submit(created.formId, { name: '张三' }).ok, true)
        const answered = await tools.getFormRequest.execute(
            { formId: created.formId, wait: false },
            'call-g6',
            { conversationId: 'c-get' },
        )
        assert.equal(answered.status, 'answered')
        assert.deepEqual(answered.values, { name: '张三' })
        assert.equal(typeof answered.answeredAt, 'number')
        assert.match(answered.hint, /重复投递/)
        assert.deepEqual(formRequests.takeUndelivered('c-get'), [], 'a read answer is not announced again')

        // wait:true parks again and receives a later submission.
        const waiting = tools.getFormRequest.execute(
            { formId: second.formId, wait: true, timeoutMs: 2_000 },
            'call-g7',
            { conversationId: 'c-get' },
        )
        formRequests.submit(second.formId, { x: 'y' })
        const waited = await waiting
        assert.equal(waited.status, 'answered')
        assert.deepEqual(waited.values, { x: 'y' })
    })
}

async function checkToolList(): Promise<void> {
    await withFormHost(async () => {
        const mine = await tools.requestUserForm.execute({
            title: '我的表单',
            fields: [{ key: 'a', label: 'A', type: 'text' }],
            wait: false,
        }, 'call-l1', { conversationId: 'c-list' })
        await tools.requestUserForm.execute({
            title: '我的第二张',
            fields: [{ key: 'b', label: 'B', type: 'text' }],
            wait: false,
        }, 'call-l2', { conversationId: 'c-list' })
        // Another conversation's form must not leak into the listing.
        formRequests.create(
            { title: '别人的表单', fields: [{ key: 'c', label: 'C', type: 'text' }] },
            { conversationId: 'c-other' },
        )

        const listed = await tools.listFormRequests.execute({}, 'call-l3', { conversationId: 'c-list' })
        assert.equal(listed.count, 2, 'listings are scoped to the calling conversation')
        assert.equal(listed.pending, 2)
        assert.ok(listed.requests.every((entry: any) => entry.conversationId === 'c-list'))
        assert.equal(listed.requests.some((entry: any) => entry.title === '别人的表单'), false)
        assert.match(listed.hint, /getFormRequest/)

        // Default includes finished forms; `includeFinished: false` filters them out.
        assert.equal(formRequests.submit(mine.formId, { a: 'done' }).ok, true)
        const all = await tools.listFormRequests.execute(
            { includeFinished: true },
            'call-l4',
            { conversationId: 'c-list' },
        )
        assert.equal(all.count, 2)
        const finished = all.requests.find((entry: any) => entry.formId === mine.formId)
        assert.equal(finished.status, 'answered')
        assert.equal(finished.hasAnswers, true)
        assert.equal(finished.batch, false, 'a single-record form is not marked batch')
        assert.equal(finished.values, undefined, 'the list must not carry the answer payload')

        const onlyPending = await tools.listFormRequests.execute(
            { includeFinished: false },
            'call-l5',
            { conversationId: 'c-list' },
        )
        assert.equal(onlyPending.count, 1)
        assert.equal(onlyPending.pending, 1)
    })
}

async function checkToolCancel(): Promise<void> {
    await withFormHost(async () => {
        // A form the agent is parked on receives status:cancelled.
        const waiting = tools.requestUserForm.execute({
            title: '别等了',
            fields: [{ key: 'v', label: 'V', type: 'text' }],
            wait: true,
            timeoutMs: 2_000,
        }, 'call-c1', { conversationId: 'c-cancel' })
        const [pendingView] = formRequests.list({ conversationId: 'c-cancel', pendingOnly: true })

        const cancelled = await tools.cancelFormRequest.execute(
            { formId: pendingView!.id, reason: '不需要了' },
            'call-c2',
            { conversationId: 'c-cancel' },
        )
        assert.equal(cancelled.ok, true)
        assert.equal(cancelled.formId, pendingView!.id)
        assert.equal(cancelled.status, 'cancelled')

        const settled = await waiting
        assert.equal(settled.status, 'cancelled')
        assert.equal(settled.reason, '不需要了')
        assert.equal(formRequests.get(pendingView!.id)?.status, 'cancelled')

        // A second cancel / unknown id reports instead of throwing.
        const again = await tools.cancelFormRequest.execute(
            { formId: pendingView!.id },
            'call-c3',
            { conversationId: 'c-cancel' },
        )
        assert.equal(again.ok, false)
        assert.match(again.note, /不存在或已处理/)
        const unknown = await tools.cancelFormRequest.execute(
            { formId: 'form-999' },
            'call-c4',
            { conversationId: 'c-cancel' },
        )
        assert.equal(unknown.ok, false)
        assert.match(unknown.note, /不存在或已处理/)

        // formId omitted: the session's only pending form is the target.
        const implicitTarget = await tools.requestUserForm.execute({
            title: '唯一待填',
            fields: [{ key: 'q', label: 'Q', type: 'text' }],
            wait: false,
        }, 'call-c5', { conversationId: 'c-cancel' })
        const implicit = await tools.cancelFormRequest.execute({}, 'call-c6', { conversationId: 'c-cancel' })
        assert.equal(implicit.ok, true)
        assert.equal(implicit.formId, implicitTarget.formId)
    })
}

/**
 * The wiring that is easy to get wrong and invisible when wrong: without
 * `scope: 'any'` / `requiresEditor: false` the workbench run (no document) would
 * never be offered these tools — but it is exactly where asking the user for
 * data happens. Runs against the real ToolProvider + the real scope rule.
 */
async function checkToolWiringInCatalog(): Promise<void> {
    const { ToolProvider } = await import('../providers/ToolProvider')
    const { registerToolFactories, clearToolFactories } = await import('../tools/tool-factory-registry')
    const { agentToolAvailableAtScope } = await import('../kernel/filter-catalog')
    const { isReadOnlyTool } = await import('../capabilities/CapabilityCatalog')

    clearToolFactories()
    registerToolFactories([createFormTools])
    try {
        // `editor: null` is the workbench: no document at all.
        const provider = new ToolProvider({ editor: null })
        const names = ['requestUserForm', 'getFormRequest', 'listFormRequests', 'cancelFormRequest']
        for (const name of names) {
            const meta = provider.getToolMetadata(name)
            assert.ok(meta, `${name} must be in the metadata registry`)
            assert.equal(meta?.source, 'builtin')
            assert.equal(meta?.category, 'interaction')
            assert.equal(meta?.scope, 'any', `${name} must be valid in every scope`)
            assert.equal(meta?.requiresEditor, false, `${name} must not need an editor`)
            assert.equal(
                agentToolAvailableAtScope(meta, false),
                true,
                `${name} must survive the workspace filter (no editor)`,
            )
            const executor: any = provider.getToolExecutor(name)
            assert.ok(executor, `${name} must be executable`)
            assert.equal(typeof executor.execute, 'function')
            assert.ok(
                executor.inputSchema && typeof executor.inputSchema === 'object',
                `${name} must ship a schema`,
            )
            assert.equal(
                isReadOnlyTool(provider.getToolMetadata(name), provider.getToolExecutor(name)),
                true,
                `${name} must be read-only for the write lease`,
            )
        }

        const requestSchema: any = provider.getToolExecutor('requestUserForm')?.inputSchema
        assert.ok(requestSchema?.properties?.fields, 'the model must be able to pass `fields`')
        assert.deepEqual(
            requestSchema.properties.fields.items.properties.type.enum,
            ['text', 'textarea', 'number', 'select', 'radio', 'multiselect', 'checkbox', 'date'],
            'the schema must advertise all eight field types',
        )
        assert.ok(requestSchema.properties.wait, 'the model must be able to choose not to wait')
        assert.ok(requestSchema.properties.timeoutMs, 'the model must be able to bound the wait')
        // Batch mode: a boolean toggle or a bounds object, so the model can pick.
        const batchSchema: any = requestSchema.properties.batch
        assert.ok(batchSchema, 'the model must be able to request a batch form')
        assert.equal(Array.isArray(batchSchema.oneOf), true, 'batch accepts two shapes')
        assert.equal(batchSchema.oneOf[0].type, 'boolean')
        assert.equal(batchSchema.oneOf[1].type, 'object')
        assert.ok(batchSchema.oneOf[1].properties.minRows, 'the batch object must expose minRows')
        assert.ok(batchSchema.oneOf[1].properties.maxRows, 'the batch object must expose maxRows')
        assert.ok(batchSchema.oneOf[1].properties.defaultRows, 'the batch object must expose defaultRows')
        assert.ok(batchSchema.oneOf[1].properties.rowLabel, 'the batch object must expose rowLabel')
        assert.ok(batchSchema.oneOf[1].properties.addLabel, 'the batch object must expose addLabel')

        const getSchema: any = provider.getToolExecutor('getFormRequest')?.inputSchema
        assert.ok(getSchema?.properties?.formId, 'getFormRequest must accept a formId')
        assert.ok(getSchema?.properties?.wait, 'getFormRequest must accept wait')

        const listSchema: any = provider.getToolExecutor('listFormRequests')?.inputSchema
        assert.ok(listSchema?.properties?.includeFinished, 'listFormRequests must accept includeFinished')

        const cancelSchema: any = provider.getToolExecutor('cancelFormRequest')?.inputSchema
        assert.ok(cancelSchema?.properties?.formId, 'cancelFormRequest must accept a formId')
        assert.ok(cancelSchema?.properties?.reason, 'cancelFormRequest must accept a reason')
    } finally {
        clearToolFactories()
    }
}

function checkWaitBudgetConstants(): void {
    assert.equal(DEFAULT_FORM_WAIT_MS, 300_000)
    assert.equal(MAX_FORM_WAIT_MS, 600_000)
}

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */

async function main(): Promise<void> {
    checkNormalize()
    checkNormalizeBatch()
    checkValidateRequiredAndBounds()
    checkValidateFormRows()
    checkRegistryCreateGet()
    checkListSnapshotIsStable()
    await checkWaitSubmitDelivers()
    await checkWaitTimeoutKeepsPending()
    await checkBatchSubmitStoresRows()
    await checkConsumeConsumesAnswered()
    await checkCancelSettlesWaiter()
    await checkTrimKeepsPendingAndUndelivered()
    checkBoardSortAndGroup()
    checkBoardText()
    checkWaitBudgetConstants()

    await checkToolRequiresHost()
    await checkToolRequestImmediate()
    await checkToolRequestWaitsForSubmit()
    await checkToolRequestTimeout()
    await checkToolRequestBatchAnswered()
    await checkToolGetAndListBatch()
    await checkToolRejectsInvalidSpec()
    await checkToolGet()
    await checkToolList()
    await checkToolCancel()
    await checkToolWiringInCatalog()

    console.log('form-requests.check: ok')
}

main().catch(error => {
    console.error(error)
    process.exit(1)
})