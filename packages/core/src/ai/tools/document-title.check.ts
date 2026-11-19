import { strict as assert } from 'node:assert'
import {
    TITLE_EDIT_HINT,
    applyDocumentTitle,
    normalizeDocumentTitle,
    titleBoundary,
} from './document-title'

/**
 * Page-title safety.
 *
 * The rules pinned here are the ones that were wrong in production:
 *  - the title is edited as LITERAL text (never parsed as HTML/Markdown),
 *  - the replaced range is derived from heading GEOMETRY (inline atoms would
 *    otherwise shorten it and leave stale text behind),
 *  - a missing heading inside the title is repaired instead of failing forever,
 *  - the title boundary is [0, title.nodeSize], so every block tool can refuse
 *    to touch it with one comparison.
 */

// ── Minimal structural fixtures (no editor / DOM needed) ─────────────
interface FakeHeading {
    type: { name: string }
    content: { size: number }
    textContent: string
}
interface FakeTitle {
    type: { name: string }
    nodeSize: number
    firstChild: FakeHeading | null
}

const heading = (text: string, atomSize = 0): FakeHeading => ({
    type: { name: 'heading' },
    // content.size counts inline atoms, textContent does not.
    content: { size: text.length + atomSize },
    textContent: text,
})

const docWithTitle = (text: string, atomSize = 0) => {
    const head = heading(text, atomSize)
    const title: FakeTitle = {
        type: { name: 'title' },
        // title(nodeSize) = heading(nodeSize) + title open/close
        nodeSize: head.content.size + 4,
        firstChild: head,
    }
    return { firstChild: title as FakeTitle | null }
}

const makeEditor = (doc: { firstChild: FakeTitle | null }) => {
    const calls: Array<{ from: number; to: number; content: any }> = []
    const editor = {
        state: {
            doc,
            tr: {
                replaceWith: (from: number, to: number, content: any) => {
                    calls.push({ from, to, content })
                },
            },
        },
        view: { dispatch: () => undefined },
        schema: {
            text: (text: string) => ({ type: 'text', text }),
            nodes: {
                heading: {
                    create: (attrs: Record<string, unknown>, content: any) => ({
                        type: 'heading', attrs, content,
                    }),
                },
            },
        },
    }
    return { editor, calls }
}

// ── 1. Titles are single-line literal text ───────────────────────────
assert.equal(normalizeDocumentTitle('  第三季度\n周报  '), '第三季度 周报')
assert.equal(normalizeDocumentTitle('R&D <终稿>'), 'R&D <终稿>')

{
    const { editor, calls } = makeEditor(docWithTitle('旧标题'))
    const result = applyDocumentTitle(editor as any, ' R&D 2026 <Q4> ')
    assert.equal(result.success, true)
    assert.equal(result.success && result.changed, true)
    assert.equal(result.success && result.previousTitle, '旧标题')
    assert.equal(calls.length, 1)
    // Literal text node — NOT a string that the editor would parse as markup.
    assert.deepEqual(calls[0].content, { type: 'text', text: 'R&D 2026 <Q4>' })
    assert.equal(typeof calls[0].content, 'object')
}

// ── 2. Range comes from node geometry, not text length ───────────────
{
    // "a" + one inline atom: content.size = 2, textContent = "a".
    const { editor, calls } = makeEditor(docWithTitle('a', 1))
    applyDocumentTitle(editor as any, 'b')
    // content starts at 2 and ends at 2 + content.size = 4. Using
    // textContent.length (1) would end at 3 and leave the atom behind.
    assert.deepEqual(calls[0], { from: 2, to: 4, content: { type: 'text', text: 'b' } })
}

// ── 3. No-op when the title already matches ──────────────────────────
{
    const { editor, calls } = makeEditor(docWithTitle('同名'))
    const result = applyDocumentTitle(editor as any, ' 同名 ')
    assert.equal(result.success && result.changed, false)
    assert.equal(calls.length, 0)
}

// ── 4. Empty / missing title / malformed title ───────────────────────
{
    const { editor, calls } = makeEditor(docWithTitle('旧'))
    const result = applyDocumentTitle(editor as any, '   ')
    assert.equal(result.success, false)
    assert.equal(calls.length, 0)
}
{
    const { editor } = makeEditor({ firstChild: null })
    const result = applyDocumentTitle(editor as any, '新标题')
    assert.equal(result.success, false)
    assert.match(!result.success ? result.error : '', /没有标题块/)
}
{
    // Title container without its required heading: repair instead of failing.
    const title: FakeTitle = { type: { name: 'title' }, nodeSize: 2, firstChild: null }
    const { editor, calls } = makeEditor({ firstChild: title })
    const result = applyDocumentTitle(editor as any, '修复标题')
    assert.equal(result.success, true)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].from, 1) // inside the title, at its end
    assert.deepEqual(calls[0].content.content, { type: 'text', text: '修复标题' })
    assert.deepEqual(calls[0].content.attrs, { level: 1 })
}

// ── 5. The boundary every block tool compares against ────────────────
{
    const doc = docWithTitle('标题') // content 2 → title.nodeSize 6
    const boundary = titleBoundary(doc)
    assert.deepEqual(boundary, { from: 0, to: 6 })
    // Every guard is "< boundary.to": 0..5 is the title, 6 is the first
    // position after it (where a top-level block may start).
    assert.ok(boundary && boundary.to === 6)
    assert.equal(titleBoundary({ firstChild: null }), null)
}

assert.match(TITLE_EDIT_HINT, /updateTitle/)

console.log('document-title: ok')