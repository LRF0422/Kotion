/**
 * Memory-aware starter suggestions for the chat empty state.
 *
 * The empty state used to be a fixed 2×2 grid. The only cross-session signal we
 * already own per user is long-term memory (plus the low-sensitivity profile
 * traits derived from it), so the grid becomes a tiny recommender: the most
 * useful memories become actionable cards and the static prompts fill whatever
 * is left. One default slot is always kept, so a cold start (or an empty
 * memory) still offers the familiar one-click actions.
 *
 * This module is deliberately pure and dependency-free: the UI supplies the
 * translations by key, and `starter-suggestions.check.ts` pins the ranking
 * rules. The backend contract is intentionally not imported here, callers pass
 * structural `MemoryLike` / `TraitLike` rows.
 */

export type StarterMode = 'ask' | 'agent'

/** Where a card came from — drives the "why this card" reason line. */
export type StarterSource = 'memory' | 'profile' | 'default'

export type StarterIconKey =
    | 'draft'
    | 'chart'
    | 'automate'
    | 'reorganize'
    | 'summarize'
    | 'find'
    | 'explain'
    | 'compare'
    | 'memory'
    | 'topic'

export interface StarterSuggestion {
    /** Stable React key; unique within one grid. */
    id: string
    source: StarterSource
    icon: StarterIconKey
    /** i18n key for the card label. */
    labelKey: string
    /** i18n key for the text sent when the card is clicked. */
    promptKey: string
    /** Interpolation params shared by both keys (`memory`, `topic`, `format`). */
    params?: Record<string, string>
}

/** The fields the recommender reads from one long-term memory row. */
export interface MemoryLike {
    memoryId?: string
    /** Hierarchical scope key (`u:{id}:s:{id}:p:{id}`). */
    scope?: string
    type?: string
    content?: string
    importance?: number
    lastAccessTime?: number
}

/** The fields the recommender reads from one derived profile trait. */
export interface TraitLike {
    dimension?: string
    value?: string
    confidence?: number
}

export interface BuildStarterSuggestionsInput {
    mode: StarterMode
    memories?: MemoryLike[]
    traits?: TraitLike[]
    /** Title of the document the conversation acts on, used for relevance. */
    pageTitle?: string
    /** Current/target page id, used to prefer page-scoped memories. */
    pageId?: string
    /** Current space id, used to prefer space-scoped memories. */
    spaceId?: string
    /** Card count; defaults to 4 (the 2×2 grid). */
    limit?: number
    /** Clock override for deterministic tests. */
    now?: number
}

const DAY_MS = 24 * 60 * 60 * 1000
const DEFAULT_LIMIT = 4
const MAX_LIMIT = 8
const MIN_MEMORY_CHARS = 4
const MAX_PROMPT_MEMORY_CHARS = 200
const MAX_REASON_CHARS = 48
const MAX_TOPIC_CHARS = 60
const MIN_TRAIT_CONFIDENCE = 60

const DEFAULT_AGENT_SUGGESTIONS: StarterSuggestion[] = [
    { id: 'default:draft', source: 'default', icon: 'draft', labelKey: 'ai.chat.promptDraft', promptKey: 'ai.chat.promptDraftText' },
    { id: 'default:chart', source: 'default', icon: 'chart', labelKey: 'ai.chat.promptChart', promptKey: 'ai.chat.promptChartText' },
    { id: 'default:automate', source: 'default', icon: 'automate', labelKey: 'ai.chat.promptAutomate', promptKey: 'ai.chat.promptAutomateText' },
    { id: 'default:reorganize', source: 'default', icon: 'reorganize', labelKey: 'ai.chat.promptReorganize', promptKey: 'ai.chat.promptReorganizeText' },
]

const DEFAULT_ASK_SUGGESTIONS: StarterSuggestion[] = [
    { id: 'default:summarize', source: 'default', icon: 'summarize', labelKey: 'ai.chat.promptSummarize', promptKey: 'ai.chat.promptSummarizeText' },
    { id: 'default:find', source: 'default', icon: 'find', labelKey: 'ai.chat.promptFind', promptKey: 'ai.chat.promptFindText' },
    { id: 'default:explain', source: 'default', icon: 'explain', labelKey: 'ai.chat.promptExplain', promptKey: 'ai.chat.promptExplainText' },
    { id: 'default:compare', source: 'default', icon: 'compare', labelKey: 'ai.chat.promptCompare', promptKey: 'ai.chat.promptCompareText' },
]

interface MemoryTemplate {
    icon: StarterIconKey
    labelKey: string
    promptKey: string
    /** Base relevance of the memory kind (preferences beat stale facts). */
    typeBonus: number
}

/** One card per memory kind keeps the four-slot grid diverse. */
const MEMORY_TEMPLATES: Record<string, MemoryTemplate> = {
    preference: {
        icon: 'memory',
        labelKey: 'ai.chat.starterPreference',
        promptKey: 'ai.chat.starterPreferenceText',
        typeBonus: 30,
    },
    episode: {
        icon: 'memory',
        labelKey: 'ai.chat.starterEpisode',
        promptKey: 'ai.chat.starterEpisodeText',
        typeBonus: 27,
    },
    note: {
        icon: 'memory',
        labelKey: 'ai.chat.starterNote',
        promptKey: 'ai.chat.starterNoteText',
        typeBonus: 22,
    },
    fact: {
        icon: 'memory',
        labelKey: 'ai.chat.starterFact',
        promptKey: 'ai.chat.starterFactText',
        typeBonus: 14,
    },
}

interface ProfileTemplate {
    icon: StarterIconKey
    labelKey: string
    promptKey: string
    /** Lower wins: a followed topic is more actionable than a format hint. */
    priority: number
}

const PROFILE_TEMPLATES: Record<string, ProfileTemplate> = {
    content_topic: {
        icon: 'topic',
        labelKey: 'ai.chat.starterTopic',
        promptKey: 'ai.chat.starterTopicText',
        priority: 0,
    },
    expertise: {
        icon: 'topic',
        labelKey: 'ai.chat.starterTopic',
        promptKey: 'ai.chat.starterTopicText',
        priority: 1,
    },
    content_format: {
        icon: 'reorganize',
        labelKey: 'ai.chat.starterFormat',
        promptKey: 'ai.chat.starterFormatText',
        priority: 2,
    },
}

interface MemoryCandidate {
    type: string
    content: string
    memory: MemoryLike
    score: number
}

/**
 * Build the starter grid. Deterministic for a given input (pass `now` in
 * tests): memories are scored, deduped and reduced to one card per kind, then
 * one profile trait may be added, then defaults fill the remaining slots.
 */
export function buildStarterSuggestions(input: BuildStarterSuggestionsInput): StarterSuggestion[] {
    const limit = clamp(input.limit ?? DEFAULT_LIMIT, 1, MAX_LIMIT)
    const defaults = input.mode === 'ask' ? DEFAULT_ASK_SUGGESTIONS : DEFAULT_AGENT_SUGGESTIONS

    // Ask mode answers from the document and keeps its fixed read-only prompts.
    if (input.mode === 'ask') {
        return defaults.slice(0, limit).map(cloneSuggestion)
    }

    // Always keep one default slot for the familiar one-click action.
    const personalizedLimit = Math.max(0, limit - 1)
    const picked = selectMemoryCards(input, personalizedLimit)
    if (picked.length < personalizedLimit) {
        picked.push(...selectProfileCards(input, personalizedLimit - picked.length))
    }

    for (const fallback of defaults) {
        if (picked.length >= limit) break
        if (picked.some(card => card.labelKey === fallback.labelKey)) continue
        picked.push(cloneSuggestion(fallback))
    }
    return picked.slice(0, limit)
}

/** True when at least one card came from memory/profile rather than defaults. */
export function hasPersonalizedSuggestions(suggestions: StarterSuggestion[]): boolean {
    return suggestions.some(suggestion => suggestion.source !== 'default')
}

function selectMemoryCards(input: BuildStarterSuggestionsInput, limit: number): StarterSuggestion[] {
    if (limit <= 0) return []
    const candidates: MemoryCandidate[] = []
    for (const memory of input.memories ?? []) {
        const content = normalizeContent(memory.content)
        if (content.length < MIN_MEMORY_CHARS) continue
        const type = normalizeMemoryType(memory.type)
        candidates.push({
            type,
            content,
            memory,
            score: scoreMemory(type, content, memory, input),
        })
    }
    // Highest score first; the first row of each kind becomes the kind's card.
    candidates.sort((a, b) => b.score - a.score)

    const cards: StarterSuggestion[] = []
    const usedTypes = new Set<string>()
    const usedContent = new Set<string>()
    for (const candidate of candidates) {
        if (cards.length >= limit) break
        const contentKey = candidate.content.toLowerCase()
        if (usedTypes.has(candidate.type) || usedContent.has(contentKey)) continue
        usedTypes.add(candidate.type)
        usedContent.add(contentKey)
        const template = MEMORY_TEMPLATES[candidate.type]
        cards.push({
            id: `memory:${candidate.type}:${candidate.memory.memoryId || cards.length}`,
            source: 'memory',
            icon: template.icon,
            labelKey: template.labelKey,
            promptKey: template.promptKey,
            params: {
                memory: clip(candidate.content, MAX_PROMPT_MEMORY_CHARS),
                topic: clip(candidate.content, MAX_REASON_CHARS),
            },
        })
    }
    return cards
}

function scoreMemory(
    type: string,
    content: string,
    memory: MemoryLike,
    input: BuildStarterSuggestionsInput,
): number {
    const now = input.now ?? Date.now()
    const importance = clamp(asNumber(memory.importance, 50), 0, 100)
    const lastAccess = asNumber(memory.lastAccessTime, now)
    const ageDays = Math.max(0, (now - lastAccess) / DAY_MS)
    const recency = Math.exp(-ageDays / 30) * 20

    let contextBonus = 0
    if (input.pageId && scopeHasPage(memory.scope, input.pageId)) {
        contextBonus += 25
    } else if (input.spaceId && scopeHasSpace(memory.scope, input.spaceId)) {
        contextBonus += 12
    }
    if (input.pageTitle) {
        contextBonus += Math.min(18, countSharedTerms(input.pageTitle, content) * 6)
    }

    return importance * 0.6 + recency + MEMORY_TEMPLATES[type].typeBonus + contextBonus
}

function selectProfileCards(input: BuildStarterSuggestionsInput, limit: number): StarterSuggestion[] {
    if (limit <= 0) return []
    const ranked: Array<{ dimension: string; value: string; confidence: number; template: ProfileTemplate }> = []
    for (const trait of input.traits ?? []) {
        const dimension = (trait.dimension ?? '').trim().toLowerCase()
        const template = PROFILE_TEMPLATES[dimension]
        if (!template) continue
        const value = normalizeContent(trait.value)
        if (value.length < 2) continue
        const confidence = clamp(asNumber(trait.confidence, 0), 0, 100)
        if (confidence < MIN_TRAIT_CONFIDENCE) continue
        ranked.push({ dimension, value, confidence, template })
    }
    ranked.sort((a, b) => a.template.priority - b.template.priority || b.confidence - a.confidence)
    const best = ranked[0]
    if (!best) return []

    const params: Record<string, string> = best.dimension === 'content_format'
        ? { format: clip(best.value, MAX_TOPIC_CHARS) }
        : { topic: clip(best.value, MAX_TOPIC_CHARS) }
    return [{
        id: `profile:${best.dimension}`,
        source: 'profile',
        icon: best.template.icon,
        labelKey: best.template.labelKey,
        promptKey: best.template.promptKey,
        params,
    }]
}

/** Page scopes end with `:p:{pageId}`; page ids may themselves contain `:`. */
function scopeHasPage(scope: string | undefined, pageId: string): boolean {
    if (!scope || !pageId) return false
    return scope.endsWith(':p:' + pageId)
}

/** Space scopes carry `:s:{spaceId}` before an optional `:p:{pageId}`. */
function scopeHasSpace(scope: string | undefined, spaceId: string): boolean {
    if (!scope || !spaceId) return false
    const marker = ':s:' + spaceId
    return scope.endsWith(marker) || scope.includes(marker + ':p:')
}

const TERM_SPLIT = /[\s,，。;；、:：!?！？()（）\[\]【】<>《》"'“”‘’/\\|·—]+/

/** How many whitespace-separated title terms appear in the memory text. */
function countSharedTerms(title: string, content: string): number {
    const haystack = content.toLowerCase()
    const terms = title.toLowerCase().split(TERM_SPLIT).filter(term => term.length >= 2)
    let hits = 0
    for (const term of terms) {
        if (haystack.includes(term)) hits += 1
    }
    return hits
}

function normalizeMemoryType(type?: string): string {
    const value = (type ?? '').trim().toLowerCase()
    return Object.prototype.hasOwnProperty.call(MEMORY_TEMPLATES, value) ? value : 'note'
}

function normalizeContent(value?: string): string {
    return (value ?? '').replace(/\s+/g, ' ').trim()
}

function clip(value: string, max: number): string {
    if (value.length <= max) return value
    return value.slice(0, max - 1).trimEnd() + '…'
}

function cloneSuggestion(suggestion: StarterSuggestion): StarterSuggestion {
    return { ...suggestion, params: suggestion.params ? { ...suggestion.params } : undefined }
}

function asNumber(value: number | undefined, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value))
}
