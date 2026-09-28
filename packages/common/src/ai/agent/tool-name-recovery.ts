/**
 * Near-name recovery for frontend tool calls.
 *
 * The model sometimes invents a plausible tool name — typically a made-up
 * namespace prefix plus a semantic suffix (`editor_insertBlocks` for
 * `insertAtBlockId`, `insertBlocksAtPosition` for the block tools) — and the
 * run pays for it: the backend answers `TOOL_NOT_FOUND` with no suggestion, so
 * the model guesses again with a different prefix (observed: 3 failed calls in
 * a row before it gave up).
 *
 * This module turns that dead end into one actionable error. Given the tool map
 * the run can ACTUALLY execute, it names the closest candidates and their
 * signatures, so the next call is the right one.
 *
 * Pure logic, no React/DOM: compiled by the check harness like the other
 * `ai/**` helpers.
 */

import type { ToolDefinition, ToolsRecord } from '../types'

/** Max candidates named back to the model. Three is enough to disambiguate. */
export const MAX_SUGGESTIONS = 3

/**
 * A suggestion is only offered when the score clears this bar. Deliberately
 * conservative: a wrong suggestion is worse than none, because the model will
 * trust it.
 */
const MIN_SCORE = 0.42

/**
 * Levenshtein distance with an early exit once the best achievable distance
 * exceeds `bound` — the candidate could not beat the current best anyway.
 */
export function editDistance(a: string, b: string, bound: number = Number.MAX_SAFE_INTEGER): number {
    if (a === b) return 0
    if (a.length === 0) return b.length
    if (b.length === 0) return a.length
    if (Math.abs(a.length - b.length) >= bound) return bound

    let previous = new Array<number>(b.length + 1)
    let current = new Array<number>(b.length + 1)
    for (let j = 0; j <= b.length; j++) previous[j] = j

    for (let i = 1; i <= a.length; i++) {
        current[0] = i
        let rowBest = current[0]
        for (let j = 1; j <= b.length; j++) {
            const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1
            current[j] = Math.min(
                previous[j] + 1,        // deletion
                current[j - 1] + 1,     // insertion
                previous[j - 1] + cost, // substitution
            )
            if (current[j] < rowBest) rowBest = current[j]
        }
        // Every remaining row can only keep the distance at or above rowBest.
        if (rowBest >= bound) return bound
        const swap = previous
        previous = current
        current = swap
    }
    return previous[b.length]
}

/** Lower-case, strip namespace separators and non-alphanumerics. */
function normalize(name: string): string {
    return (name || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '')
}

/**
 * Comparison keys for a tool name. Besides the normalised full name, the name
 * with a leading `namespace_` segment stripped is scored too, because the model
 * habitually prepends one (`editor_insertBlocks` → `insertblocks`, which is one
 * substitution away from the real `insertatblockid`).
 */
function keysFor(name: string): string[] {
    const full = normalize(name)
    const keys = [full]
    const loose = (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
    const parts = loose.split('_').filter(Boolean)
    if (parts.length > 1) {
        keys.push(parts.slice(1).join(''))
        keys.push(parts[parts.length - 1])
    }
    return Array.from(new Set(keys.filter(Boolean)))
}

/** Similarity in [0, 1]: 1 = identical after normalisation. */
function similarity(wanted: string, candidate: string): number {
    let best = 0
    for (const a of keysFor(wanted)) {
        for (const b of keysFor(candidate)) {
            const distance = editDistance(a, b)
            const score = 1 - distance / Math.max(a.length, b.length)
            if (score > best) best = score
        }
    }
    return best
}

/** Compact `(blockId: string, markdown: string, position?: "before" | "after")` rendering. */
export function describeSignature(inputSchema: any, maxParams = 6): string {
    const properties = inputSchema?.properties
    if (!properties || typeof properties !== 'object') return '()'
    const required = new Set<string>(Array.isArray(inputSchema.required) ? inputSchema.required : [])
    const parts: string[] = []
    for (const [name, schema] of Object.entries(properties as Record<string, any>)) {
        if (parts.length >= maxParams) {
            parts.push('…')
            break
        }
        parts.push(`${name}${required.has(name) ? '' : '?'}: ${typeOf(schema)}`)
    }
    return `(${parts.join(', ')})`
}

function typeOf(schema: any): string {
    const type = schema?.type
    if (Array.isArray(type)) return type.filter(Boolean).join('|') || 'any'
    if (type === 'array') {
        const items = schema?.items?.type
        return items ? `array<${Array.isArray(items) ? items.join('|') : items}>` : 'array'
    }
    if (type === 'object') return 'object'
    return type || 'any'
}

export interface ToolSuggestion {
    name: string
    description: string
    signature: string
    score: number
}

/**
 * Closest executable tools to `wanted`, best first. Names are compared after
 * normalisation, so case/underscore/prefix differences still match.
 */
export function suggestToolNames(
    wanted: string,
    tools: ToolsRecord,
    limit: number = MAX_SUGGESTIONS,
): ToolSuggestion[] {
    if (!wanted) return []
    const scored: ToolSuggestion[] = []
    for (const [name, definition] of Object.entries(tools || {})) {
        if (!name || typeof (definition as ToolDefinition)?.execute !== 'function') continue
        const score = similarity(wanted, name)
        if (score < MIN_SCORE) continue
        scored.push({
            name,
            description: String((definition as ToolDefinition).description || ''),
            signature: describeSignature((definition as ToolDefinition).inputSchema),
            score,
        })
    }
    scored.sort((a, b) => b.score - a.score || a.name.length - b.name.length || a.name.localeCompare(b.name))
    return scored.slice(0, Math.max(0, limit))
}

/**
 * Error text for a frontend tool call whose name is not registered. Names the
 * closest available tools so the model can correct itself in one step instead
 * of guessing another prefix.
 */
export function unknownToolError(wanted: string, tools: ToolsRecord, limit: number = MAX_SUGGESTIONS): string {
    const base = `Tool "${wanted}" is not registered, so this call cannot run.`
    const suggestions = suggestToolNames(wanted, tools, limit)
    if (suggestions.length === 0) {
        return `${base} Call one of the tools listed in your tool catalog instead of inventing a name.`
    }
    const lines = suggestions.map(
        (suggestion, index) =>
            `${index + 1}. ${suggestion.name}${suggestion.signature} — ${firstSentence(suggestion.description)}`,
    )
    return [
        base,
        'Closest available tools (use the exact name and arguments):',
        ...lines,
        'Do not invent tool names; if none of these fits, read the document again and use a listed tool.',
    ].join('\n')
}

function firstSentence(text: string): string {
    const trimmed = (text || '').trim().replace(/\s+/g, ' ')
    if (!trimmed) return 'no description'
    const stop = trimmed.search(/[。.!\n]/)
    const sentence = stop > 0 ? trimmed.slice(0, stop) : trimmed
    return sentence.length > 140 ? sentence.slice(0, 139) + '…' : sentence
}


/**
 * Map a model-supplied tool name onto the run's canonical tool name.
 *
 * Backend counterpart exists in the agent loop (`AgentLoop#resolveToolName`) and
 * the two must accept the same shapes: a plugin's tools are namespaced on the
 * wire (`{pluginKey}__{localName}`) while the system prompt refers to them bare,
 * so a dropped separator, a different case, or a namespace the model invented
 * (`editor_insertBlocks`) must still reach the tool instead of failing.
 *
 * Resolution order, most literal first: exact name → a name that normalises to
 * exactly one tool → the remainder after dropping leading namespace segments →
 * a high-confidence near-match. Ambiguity never resolves: guessing between two
 * real tools is worse than failing.
 *
 * @returns the canonical name, or `null` when nothing matches confidently.
 */
export function resolveToolName(wanted: string, tools: ToolsRecord): string | null {
    const trimmed = (wanted || '').trim()
    if (!trimmed) return null
    const names = Object.keys(tools || {}).filter(
        name => typeof (tools as Record<string, ToolDefinition>)[name]?.execute === 'function',
    )
    if (names.length === 0) return null

    // Literal match always wins.
    if (names.includes(trimmed)) return trimmed

    const byKey = new Map<string, string | null>()
    for (const name of names) {
        const key = normalize(name)
        if (!key) continue
        byKey.set(key, byKey.has(key) ? null : name)
    }

    const key = normalize(trimmed)
    if (!key) return null
    const exact = byKey.get(key)
    if (exact) return exact

    // Drop leading namespace segments: `searchPages` → `kn_plugin-main__searchPages`,
    // `editor_insertBlocks` → `insertAtBlockId`.
    const segments = trimmed.replace(/^\/+/, '').split(/__|[\s/]+/).filter(Boolean)
    for (let start = 1; start < segments.length; start++) {
        const remainderKey = normalize(segments.slice(start).join(''))
        if (!remainderKey) continue
        const unique = byKey.get(remainderKey)
        if (unique) return unique
    }

    // Last resort: the invented name's words are an ordered subset of a real
    // tool's words (`editor_insertBlocks` → insert, blocks ⊂ insert, at, block,
    // id). Strict by design — it either matches one tool or nothing.
    return uniqueSubsequenceMatch(trimmed, names)
}

/**
 * Words of a name as written: camelCase and non-alphanumerics are the only real
 * word boundaries available (a concatenated `insertblocks` is not separable
 * without a dictionary, which is exactly why string heuristics were unreliable).
 */
function nameWords(name: string): string[] {
    return (name || '')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .split(/[^A-Za-z0-9]+/)
        .filter(Boolean)
        .map(part => normalize(part))
        .filter(Boolean)
}

/**
 * The single tool that best accounts for the wanted name's words.
 *
 * Reached only after exact / normalised / namespace-strip lookups failed, so the
 * leading words here are namespace noise the model invented and are dropped
 * progressively: `editor_insertBlocks` is scored on `insert` + `blocks` (an
 * ordered subset of `insert, at, block, id`) rather than on `editor`, which no
 * tool has. The winner must account for most of its own name; a tie means two
 * tools fit the words and nothing resolves.
 */
function uniqueSubsequenceMatch(wanted: string, names: string[]): string | null {
    const wantedWords = nameWords(wanted)
    if (wantedWords.length === 0) return null
    let match: string | null = null
    for (const name of names) {
        const candidateWords = nameWords(name)
        if (candidateWords.length === 0) continue
        let best = 0
        for (let start = 0; start < wantedWords.length; start++) {
            const tail = wantedWords.slice(start)
            if (!isOrderedSubset(tail, candidateWords)) continue
            const coverage = tail.reduce((sum, word) => sum + word.length, 0) / normalize(name).length
            // One shared word is not evidence: `web_search` shares `search` with
            // `searchPages` but needs two words (or one that is essentially the
            // whole name) to be the tool it meant.
            if (tail.length === 1 && coverage < 0.6) continue
            if (coverage > best) best = coverage
        }
        if (best < 0.5) continue
        if (match !== null) return null // ambiguous: two tools fit the words
        match = name
    }
    return match
}

/**
 * Two words refer to the same thing: equal, one a prefix of the other, or a
 * shared stem. Deliberately strict — a loose "these letters appear in order"
 * rule made `blocks` match `near`, so the real match came back ambiguous.
 */
function strongWordMatch(a: string, b: string): boolean {
    if (!a || !b) return false
    if (a === b) return true
    const shorter = a.length <= b.length ? a : b
    const longer = a.length <= b.length ? b : a
    if (shorter.length < 3) return false
    if (longer.startsWith(shorter)) return true
    return 1 - editDistance(shorter, longer.slice(0, shorter.length)) / shorter.length >= 0.8
}

/**
 * Whether every word of `wanted` can be matched, in order, by the candidate
 * words, skipping candidates when needed — `blocks` skips `at` to reach `block`.
 */
function isOrderedSubset(wanted: string[], candidates: string[]): boolean {
    if (wanted.length === 0) return true
    const [head, ...tail] = wanted
    for (let index = 0; index < candidates.length; index++) {
        if (!strongWordMatch(head, candidates[index])) continue
        if (isOrderedSubset(tail, candidates.slice(index + 1))) return true
    }
    return false
}
