/**
 * Runtime checks for near-name tool recovery.
 *
 * The regression this guards: the model invents a tool name (typically a
 * made-up namespace prefix, e.g. `editor_insertBlocks`), the backend answers
 * `TOOL_NOT_FOUND`, and without a suggestion the model guesses again with a
 * different prefix. The recovery must therefore name the real tool — and must
 * NOT name an unrelated one, because a confident wrong suggestion is worse than
 * none.
 *
 * Run: node --localstorage-file=.tmp-check/tool-recovery-localstorage \
 *        .tmp-check/tool-recovery/ai/agent/tool-name-recovery.check.js
 */

import { strict as assert } from 'node:assert'
import {
    MAX_SUGGESTIONS,
    describeSignature,
    editDistance,
    suggestToolNames,
    unknownToolError,
} from './tool-name-recovery'

function tool(description: string, inputSchema: any = { type: 'object' }) {
    return { description, inputSchema, execute: async () => ({ ok: true }) }
}

/**
 * A stand-in for the real editor catalog: the names the model SHOULD use, with
 * their real signatures (taken from packages/core/src/ai/tools/*.ts).
 */
const TOOLS: any = {
    insertAtBlockId: tool('在指定 blockId 的块之前或之后插入内容，支持 Markdown。比 blockIndex/位置寻址更可靠', {
        type: 'object',
        properties: { blockId: { type: 'string' }, markdown: { type: 'string' }, position: { type: 'string' } },
        required: ['blockId', 'markdown'],
    }),
    insertNear: tool('在匹配文本附近插入内容', {
        type: 'object',
        properties: { searchText: { type: 'string' }, markdown: { type: 'string' }, position: { type: 'string' } },
        required: ['searchText', 'markdown'],
    }),
    applyEdits: tool('批量执行多个编辑操作（替换/插入/删除/追加）', {
        type: 'object',
        properties: { operations: { type: 'array', items: { type: 'object' } } },
        required: ['operations'],
    }),
    replaceBlockById: tool('通过 blockId 替换整个块', {
        type: 'object',
        properties: { blockId: { type: 'string' }, markdown: { type: 'string' } },
        required: ['blockId', 'markdown'],
    }),
    deleteBlocks: tool('按 blockId 删除整块', {
        type: 'object',
        properties: { blockIds: { type: 'array', items: { type: 'string' } } },
        required: ['blockIds'],
    }),
    getDocumentStructure: tool('获取文档结构与 blockId', { type: 'object', properties: {} }),
    insertColumns: tool('插入分栏布局', {
        type: 'object',
        properties: { columns: { type: 'number' } },
        required: ['columns'],
    }),
    updateTitle: tool('更新文档标题', { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] }),
}

function checkEditDistance(): void {
    assert.equal(editDistance('abc', 'abc'), 0)
    assert.equal(editDistance('', 'abc'), 3)
    assert.equal(editDistance('insertatblockid', 'editorinsertblocks') > 0, true)
    // The bound must not change the answer when it is not exceeded.
    assert.equal(editDistance('kitten', 'sitting'), 3)
    assert.equal(editDistance('kitten', 'sitting', 3), 3)
    // …and must early-exit once the bound is provably unreachable.
    assert.equal(editDistance('kitten', 'sitting', 2), 2)
}

function checkSignature(): void {
    assert.equal(
        describeSignature(TOOLS.insertAtBlockId.inputSchema),
        '(blockId: string, markdown: string, position?: string)',
    )
    assert.equal(describeSignature({ type: 'object', properties: {} }), '()')
    assert.equal(describeSignature(undefined), '()')
    // Wide schemas are elided rather than dumped into the prompt.
    const wide: any = { type: 'object', properties: {} }
    for (let i = 0; i < 9; i++) wide.properties['p' + i] = { type: 'string' }
    assert.ok(describeSignature(wide).includes('…'))
}

function checkInventedNames(): void {
    // The two names actually observed in the wild.
    const prefixed = suggestToolNames('editor_insertBlocks', TOOLS)
    assert.equal(prefixed[0]?.name, 'insertAtBlockId',
        'a made-up namespace prefix must still recover the real insert tool')

    const snake = suggestToolNames('insertBlocksAtPosition', TOOLS)
    assert.equal(snake[0]?.name, 'insertAtBlockId')
    assert.ok(snake.length <= MAX_SUGGESTIONS)

    // Camel/snake/case differences of an existing name must resolve to it.
    for (const variant of ['insert_at_block_id', 'InsertAtBlockID', 'insertAtBlockID']) {
        assert.equal(suggestToolNames(variant, TOOLS)[0]?.name, 'insertAtBlockId', variant)
    }
}

function checkNoFalseConfidence(): void {
    // Unrelated names must yield nothing: a wrong suggestion is worse than none.
    assert.deepEqual(suggestToolNames('web_search', TOOLS), [])
    assert.deepEqual(suggestToolNames('zzzzzzzzzzzz', TOOLS), [])
    assert.deepEqual(suggestToolNames('', TOOLS), [])

    // A bare namespace-ish token must not drag in an arbitrary tool.
    assert.deepEqual(suggestToolNames('editor', TOOLS), [])
}

function checkErrorMessage(): void {
    const message = unknownToolError('editor_insertBlocks', TOOLS)
    assert.ok(message.startsWith('Tool "editor_insertBlocks" is not registered'), message)
    assert.ok(message.includes('insertAtBlockId(blockId: string, markdown: string, position?: string)'), message)
    assert.ok(message.includes('Do not invent names or namespace prefixes'), message)

    // Without any close match the message still tells the model what to do.
    const bare = unknownToolError('web_search', TOOLS)
    assert.ok(bare.includes('web_search'))
    assert.ok(bare.includes('tool catalog'), bare)
    assert.ok(!bare.includes('Closest available'), bare)
}

function checkIgnoresNonExecutable(): void {
    const withMetadataOnly: any = {
        insertAtBlockId: tool('real'),
        editor_insertBlocks: { description: 'metadata only', inputSchema: { type: 'object' } },
    }
    // A metadata entry without an executor is not callable, so it is not offered.
    assert.deepEqual(suggestToolNames('editor_insertBlocks', withMetadataOnly).map(s => s.name), ['insertAtBlockId'])
    const message = unknownToolError('editor_insertBlocks', { ...withMetadataOnly, insertAtBlockId: undefined })
    assert.ok(!message.includes('Closest available'), message)
}

function main(): void {
    checkEditDistance()
    checkSignature()
    checkInventedNames()
    checkNoFalseConfidence()
    checkErrorMessage()
    checkIgnoresNonExecutable()
    console.log('tool-name-recovery checks passed')
}

main()
