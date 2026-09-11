/**
 * Unit checks for the pure page-tree helpers. Run with:
 *   pnpm --filter @kn/core check:agent-pages
 */

import {
    flattenPageTree,
    formatPageTree,
    resolveCreatePlacement,
    toPageId,
} from './page-tree'

const assert = (condition: unknown, message: string): void => {
    if (!condition) throw new Error(message)
}

// ---- toPageId ----
assert(toPageId(' 42 ') === '42', 'string ids should trim')
assert(toPageId(42) === '42', 'numeric ids should stringify')
assert(toPageId(42n) === '42', 'bigint ids should stringify')
assert(toPageId('') === null, 'blank ids should be null')
assert(toPageId(1.5) === null, 'fractional ids should be null')
assert(toPageId(null) === null && toPageId(undefined) === null, 'missing ids should be null')

// ---- flattenPageTree ----
const tree = [
    {
        id: 'a',
        title: 'A',
        children: [
            { id: 'a1', title: 'A1' },
            { id: 'a2', title: 'A2', children: [{ id: 'a2x', title: 'A2X' }] },
        ],
    },
    { id: 'b', title: 'B', hasChildren: true, childCount: 2 },
    { title: 'no id ignored' },
]

const flat = flattenPageTree(tree)
assert(flat.length === 5, `expected 5 flattened nodes, got ${flat.length}`)
assert(flat[0].pageId === 'a' && flat[0].depth === 0 && flat[0].parentId === null, 'root A shape')
assert(flat[1].pageId === 'a1' && flat[1].depth === 1 && flat[1].parentId === 'a', 'child A1 shape')
assert(flat[3].pageId === 'a2x' && flat[3].depth === 2 && flat[3].parentId === 'a2', 'grandchild A2X shape')
assert(flat[4].pageId === 'b' && flat[4].depth === 0, 'root B shape after nested children')
assert(flat[1].hasChildren === false, 'leaf hasChildren false')
assert(flat[4].hasChildren === true && flat[4].childCount === 2, 'B keeps child hint without children array')

// Explicit parentId on a node wins over the traversal parent.
const withParent = flattenPageTree([{ id: 'x', parentId: 'explicit' }])
assert(withParent[0].parentId === 'explicit', 'node parentId should win')

// Non-array / empty input is safe.
assert(flattenPageTree(null).length === 0, 'null tree is empty')
assert(flattenPageTree(undefined).length === 0, 'undefined tree is empty')

// ---- formatPageTree ----
const formatted = formatPageTree(flat, { maxNodes: 3 })
assert(formatted.truncated === true, 'format should report truncation')
assert(formatted.text.split('\n').length === 3, 'format should cap lines')
assert(formatted.text.includes('[a1]'), 'format includes page id')
const full = formatPageTree(flat, { maxNodes: 100 })
assert(full.truncated === false, 'no truncation under cap')
assert(full.text.startsWith('- A [a]'), 'root line formatting')
assert(full.text.includes('  - A1 [a1]'), 'indented child formatting')

// ---- resolveCreatePlacement ----
const placementCases: Array<[Parameters<typeof resolveCreatePlacement>[0], string | null, string]> = [
    [{ parentId: 'p', relativeTo: 'r', position: 'child' }, 'p', 'explicit parentId wins'],
    [{ parentId: null }, null, 'explicit null = root'],
    [{ relativeTo: 'r', position: 'sibling', relativeParentId: 'rp' }, 'rp', 'sibling uses relative parent'],
    [{ relativeTo: 'r', position: 'sibling', relativeParentId: null }, null, 'sibling of root'],
    [{ relativeTo: 'r', position: 'child' }, 'r', 'child of relativeTo'],
    [{ relativeTo: 'r' }, 'r', 'undefined position defaults to child'],
    [{ position: 'child', currentPageId: 'cur' }, 'cur', 'child of current page'],
    [{ asSubPage: true, currentPageId: 'cur' }, 'cur', 'legacy asSubPage'],
    [{}, null, 'default is root'],
    [{ position: 'root', relativeTo: 'r' }, null, 'explicit root ignores relativeTo'],
    [{ parentId: undefined, asSubPage: true, currentPageId: null }, null, 'no current page falls back to root'],
]
for (const [input, expected, label] of placementCases) {
    const actual = resolveCreatePlacement(input).parentId
    assert(actual === expected, `${label}: expected ${String(expected)}, got ${String(actual)}`)
}

// Blank/whitespace ids are treated as absent.
assert(resolveCreatePlacement({ relativeTo: '   ', asSubPage: true, currentPageId: 'c' }).parentId === 'c', 'blank relativeTo is ignored')
assert(resolveCreatePlacement({ parentId: '  ' }).parentId === null, 'blank explicit parent is root')

console.log('page-tree checks passed')
