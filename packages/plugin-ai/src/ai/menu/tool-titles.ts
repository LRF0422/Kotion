/**
 * Titles for the agent's tool calls in the activity timeline.
 *
 * A row has to say what the agent DID, not just which tool ran. The localized
 * tool name is only the fallback: "切换编辑页面" is not wrong, but the user
 * asked why the agent is on another page — "切换到页面「入职手册」" answers it.
 * So a call that carries a human-readable subject (page title, search query,
 * skill name, block count…) is titled from its own arguments/results.
 *
 * Deliberately dependency-free (a plain translate function in, a string out) so
 * the rules can be pinned by `tool-titles.check.ts` without the app's module
 * graph, i18n runtime or React.
 */

/** The slice of i18next's `t` this module needs. */
export type ToolTitleTranslate = (
    key: string,
    options?: Record<string, string | number>,
) => string

/** Minimal shape of an activity step; `ExecutionStep` matches it. */
export interface ToolCallLike {
    toolName: string
    args?: unknown
    result?: unknown
}

/**
 * A subject longer than this is clipped: the header is one line next to a
 * status badge, and a task description or question can be a paragraph.
 */
const MAX_SUBJECT_CHARS = 24

/** Tool ids are snake_case or camelCase; both should read as words. */
export function humanizeToolName(toolName: string): string {
    return toolName
        .replace(/_/g, ' ')
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, str => str.toUpperCase())
        .trim()
}

/**
 * Localized name of a tool. Plugin tools are an open set the host cannot
 * translate, so they keep the readable Title Case fallback.
 */
export function toolLabel(t: ToolTitleTranslate, toolName: string): string {
    const key = `ai.chat.toolNames.${toolName}`
    const translated = t(key)
    if (translated && translated !== key) return translated
    return humanizeToolName(toolName)
}

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
    value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : undefined

/** Normalize a subject for a one-line title: collapsed whitespace, clipped. */
const subject = (value: unknown): string | undefined => {
    if (typeof value !== 'string') return undefined
    const text = value.trim().replace(/\s+/g, ' ')
    if (!text) return undefined
    return text.length > MAX_SUBJECT_CHARS ? `${text.slice(0, MAX_SUBJECT_CHARS)}…` : text
}

const arrayLength = (value: unknown): number | undefined =>
    Array.isArray(value) ? value.length : undefined

/** Host only: a full URL would eat the whole line. */
const hostOf = (value: unknown): string | undefined => {
    if (typeof value !== 'string') return undefined
    const url = value.trim()
    if (!url) return undefined
    const host = url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').split(/[/?#]/)[0]
    if (!host) return undefined
    return host.length > MAX_SUBJECT_CHARS ? `${host.slice(0, MAX_SUBJECT_CHARS)}…` : host
}

/**
 * Title for one tool call.
 *
 * Fallbacks are deliberately per-branch: a call whose arguments are still
 * streaming (or a legacy transcript that stored no args) must keep the plain
 * tool label rather than showing an empty template.
 */
export function toolCallTitle(t: ToolTitleTranslate, call: ToolCallLike): string {
    const args = asRecord(call.args)
    const result = asRecord(call.result)
    const fallback = () => toolLabel(t, call.toolName)

    /** "verb「subject」" — the common case. */
    const named = (key: string, value: unknown): string | undefined => {
        const name = subject(value)
        if (!name) return undefined
        const text = t(key, { name })
        return text && text !== key ? text : undefined
    }

    switch (call.toolName) {
        case 'updateTitle':
            // The schema says `newTitle`; reading the generic `title` here
            // silently produced "修改标题" for every real call.
            return named('ai.chat.toolTitles.updateTitle', args?.newTitle) ?? fallback()
        case 'renamePage':
            return named('ai.chat.toolTitles.renamePage', args?.title) ?? fallback()
        case 'createPage':
            return named('ai.chat.toolTitles.createPage', args?.title) ?? fallback()
        case 'editPage':
            // `editPage` only switches the off-screen target, and its result
            // carries the title the id was resolved to.
            return named('ai.chat.toolTitles.editPage', result?.title) ?? fallback()
        case 'openPage':
            return named('ai.chat.toolTitles.openPage', result?.title) ?? fallback()
        case 'searchInDocument':
            return named('ai.chat.toolTitles.searchInDocument', args?.query) ?? fallback()
        case 'searchPages':
            return named('ai.chat.toolTitles.searchPages', args?.query) ?? fallback()
        case 'web_search':
            return named('ai.chat.toolTitles.webSearch', args?.query) ?? fallback()
        case 'web_fetch': {
            const host = hostOf(args?.url)
            if (!host) return fallback()
            const text = t('ai.chat.toolTitles.webFetch', { name: host })
            return text && text !== 'ai.chat.toolTitles.webFetch' ? text : fallback()
        }
        case 'readChunk': {
            const from = typeof args?.from === 'number' ? args.from : undefined
            if (from === undefined || from <= 0) return fallback()
            const text = t('ai.chat.toolTitles.readFrom', { from })
            return text && text !== 'ai.chat.toolTitles.readFrom' ? text : fallback()
        }
        case 'applyEdits': {
            const count = arrayLength(args?.operations)
            if (!count) return fallback()
            const text = t('ai.chat.toolTitles.applyEdits', { count })
            return text && text !== 'ai.chat.toolTitles.applyEdits' ? text : fallback()
        }
        case 'deleteBlocks': {
            const ids = args?.blockIds
            const count = typeof ids === 'string' ? 1 : arrayLength(ids)
            if (!count || count < 2) return fallback()
            const text = t('ai.chat.toolTitles.deleteBlocks', { count })
            return text && text !== 'ai.chat.toolTitles.deleteBlocks' ? text : fallback()
        }
        case 'requestUserForm':
            return named('ai.chat.toolTitles.requestUserForm', args?.title) ?? fallback()
        case 'askUserChoice':
            return named('ai.chat.toolTitles.askUserChoice', args?.question) ?? fallback()
        case 'load_skill':
            return named('ai.chat.toolTitles.loadSkill', args?.skill) ?? fallback()
        case 'delegate':
            return named('ai.chat.toolTitles.delegate', args?.task) ?? fallback()
        case 'insertNear':
            return named('ai.chat.toolTitles.insertNear', args?.searchText) ?? fallback()
        default:
            return fallback()
    }
}