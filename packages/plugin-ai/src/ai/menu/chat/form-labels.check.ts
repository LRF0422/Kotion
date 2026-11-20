import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Pins the dynamic-form i18n wiring.
 *
 * The form inbox board and `AgentFormCard` call `t('ai.chat.forms.…')` with a
 * Chinese `defaultValue`, so a key missing from the bundles degrades silently to
 * Chinese copy in the English UI — exactly the bug this check exists for. It
 * reads the plugin's real locale blocks (the object literal in `src/index.tsx`,
 * which is React-free data) and asserts:
 *
 *  1. `en` and `zh` declare the same key set, ignoring i18next's plural suffixes
 *     (`_one` / `_other`), so neither language can drift;
 *  2. every `t('ai.chat.forms.…')` key used by the form surfaces resolves in both;
 *  3. `@kn/ui` strings that used to be hardcoded Chinese (batch hints, yes/no,
 *     relative time, …) are fed by `form-labels.ts`, otherwise the card's Chinese
 *     defaults win in an English UI.
 *
 * Run: `pnpm --filter @kn/plugin-ai check:form-labels`.
 */

const read = (relative: string): string => readFileSync(join(process.cwd(), relative), 'utf8')

const source = read('src/index.tsx')

/** The object literal starting at the first `{` at/after `from`, brace-matched. */
function objectAt(from: number): string {
    const start = source.indexOf('{', from)
    assert.ok(start >= 0, `no object literal after index ${from}`)
    let depth = 0
    for (let index = start; index < source.length; index += 1) {
        const char = source[index]
        if (char === '{') depth += 1
        else if (char === '}') {
            depth -= 1
            if (depth === 0) return source.slice(start, index + 1)
        }
    }
    throw new Error('unbalanced braces in src/index.tsx')
}

/** Every `"key":` declared inside a block (nested `relativeTime` included). */
const declaredKeys = (block: string): string[] =>
    [...block.matchAll(/"([A-Za-z0-9_]+)"\s*:/g)].map(match => match[1])

/** Drop i18next plural suffixes so `en`'s `_one`/`_other` pair equals `zh`'s key. */
const baseKey = (key: string): string => key.replace(/_(zero|one|two|few|many|other)$/, '')

const blocks = [...source.matchAll(/"forms":\s*\{/g)].map(match => {
    const start = match.index ?? 0
    return { start, text: objectAt(start) }
})
assert.equal(blocks.length, 2, 'expected one `forms` bundle per language in src/index.tsx')

/** Which locale block (`en: {` / `zh: {`) encloses this position. */
const languageOf = (position: number): 'en' | 'zh' => {
    const enAt = source.lastIndexOf('en: {', position)
    const zhAt = source.lastIndexOf('zh: {', position)
    assert.ok(enAt >= 0 || zhAt >= 0, 'locale blocks `en:` / `zh:` not found')
    return enAt > zhAt ? 'en' : 'zh'
}

const bundles = new Map<'en' | 'zh', Set<string>>()
for (const { start, text } of blocks) {
    const language = languageOf(start)
    assert.ok(!bundles.has(language), `duplicate \`forms\` bundle for ${language}`)
    bundles.set(language, new Set(declaredKeys(text).map(baseKey)))

    // No empty message: a declared "" would render as an invisible label.
    const empties = [...text.matchAll(/"([A-Za-z0-9_]+)"\s*:\s*""/g)].map(match => match[1])
    assert.deepEqual(empties, [], `${language}: empty form message(s): ${empties.join(', ')}`)

    // Sanity: the parts that make the board usable are declared.
    for (const key of ['title', 'empty', 'emptyHint', 'footer', 'submit', 'batchHint']) {
        assert.ok(bundles.get(language)!.has(key), `${language}: forms.${key} missing`)
    }
}

const en = bundles.get('en')
const zh = bundles.get('zh')
assert.ok(en && zh, 'both `en` and `zh` form bundles are required')

// 1. Same key set in both languages (plural suffixes normalized away).
assert.deepEqual([...en].sort(), [...zh].sort(), 'en/zh form bundles declare different keys')

// 2. Every key a surface actually asks for exists in both bundles. Nested keys
//    (`relativeTime.justNow`) are checked segment by segment, since the key sets
//    above are flat.
const surfaceSources = [
    'src/ai/menu/chat/FormRequestsPanel.tsx',
    'src/ai/menu/chat/FormRequestCard.tsx',
    'src/ai/menu/chat/form-labels.ts',
].map(read)
const used = new Set(
    surfaceSources.flatMap(text => (
        [...text.matchAll(/t\('ai\.chat\.forms\.([A-Za-z0-9_.]+)'/g)].map(match => match[1])
    )),
)
assert.ok(used.size >= 30, `expected the form surfaces to use ≥30 keys, saw ${used.size}`)
for (const key of used) {
    for (const segment of key.split('.')) {
        const base = baseKey(segment)
        assert.ok(en.has(base), `en: ai.chat.forms.${key} is used but \`${base}\` is not declared`)
        assert.ok(zh.has(base), `zh: ai.chat.forms.${key} is used but \`${base}\` is not declared`)
    }
}

// 3. The labels hook must feed the card every string the card can localize, or
//    an English user falls back to the Chinese defaults in @kn/ui.
const labelsSource = read('src/ai/menu/chat/form-labels.ts')
for (const key of [
    'batchHint', 'batchLimit', 'yes', 'no', 'listSeparator', 'labelSeparator',
    'batchCellAria', 'batchRowsCount', 'selectedCount', 'relativeTime',
    'multiSelectPlaceholder', 'rowNumber',
]) {
    assert.ok(
        new RegExp(`\\b${key}\\b`).test(labelsSource),
        `form-labels.ts does not provide \`${key}\`, so @kn/ui's Chinese default wins`,
    )
}

console.log(`form-labels.check: ok (${used.size} used keys, ${en.size} declared per language)`)