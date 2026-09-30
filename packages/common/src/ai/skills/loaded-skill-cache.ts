/**
 * Session-scoped memory of the skills a conversation has already loaded.
 *
 * <p>`load_skill` delivers a skill's tool schemas inside its tool result, and the
 * backend makes those tools routable for the REST of that run — nothing more. The
 * next user turn is a NEW run, so without memory the model has to call
 * `load_skill` again for a capability it loaded one message earlier: a wasted
 * round trip, and a schema it can already read in the transcript. The prompt
 * already tells it not to (`capability-discovery`: "已经加载过的不用重复加载") —
 * the routing just did not back that up, and a direct call was rejected as an
 * unknown tool.
 *
 * <p>This store closes that gap on the side that owns the truth. A skill loaded on
 * a conversation is remembered by NAME — never by schema: the live catalog stays
 * the only source of the specs, so a plugin update, an uninstall, or a surface
 * that loses its document is reflected on the very next run (see
 * {@link buildAgentRunInputs}, which re-derives the tools and re-checks
 * availability).
 *
 * <p>What the run-input builder does with the memory is deliberately NOT "advertise
 * it": the tools ride the deferred channel — CALLABLE from the first step, listed
 * in the backend's 【按需工具】 directory, still out of the provider's `tools` array.
 * Adding them to that array would move it, and `tools` renders before the
 * messages, so the whole cached prefix would be re-billed; a deferred tool is
 * appended at the tail and costs nothing. The schema itself is already in the
 * transcript from the `load_skill` result that caused the memory.
 *
 * <p>Keys are conversation ids (`undefined`/blank = no memory: an ephemeral
 * surface with no conversation has nothing to carry across turns). The map is
 * bounded and evicts insertion-oldest, so a long-lived tab cannot leak; it is
 * deliberately in-memory only — a reload starts with a fresh client, and the
 * worst case is one `load_skill` call that re-establishes the memory.
 */

/** Conversations tracked at once; beyond this the oldest is evicted. */
const MAX_TRACKED_CONVERSATIONS = 32

/** conversationId → skill names (canonical, as `load_skill` resolved them). */
const loadedByConversation = new Map<string, Set<string>>()

const listeners = new Set<() => void>()

/** Bumped on every change so React surfaces can re-derive their run inputs. */
let version = 0

function conversationKey(conversationId?: string | null): string | null {
    const key = typeof conversationId === 'string' ? conversationId.trim() : ''
    return key.length > 0 ? key : null
}

function notify(): void {
    version += 1
    for (const listener of [...listeners]) {
        try {
            listener()
        } catch {
            // A broken subscriber must not corrupt the cache for the others.
        }
    }
}

/**
 * Remember that `skillName` was loaded on `conversationId`.
 *
 * @returns true when this was news (the caller may want to say so); false for a
 * blank key/name or a skill the conversation already knows.
 */
export function rememberLoadedSkill(
    conversationId: string | null | undefined,
    skillName: string | null | undefined,
): boolean {
    const key = conversationKey(conversationId)
    const name = typeof skillName === 'string' ? skillName.trim() : ''
    if (!key || !name) return false
    const known = loadedByConversation.get(key)
    if (known?.has(name)) {
        // Re-insert so heavy use of one conversation keeps it out of the eviction
        // window; the SET stays unchanged (no notify: nothing an observer sees).
        loadedByConversation.delete(key)
        loadedByConversation.set(key, known)
        return false
    }
    const next = known ?? new Set<string>()
    next.add(name)
    loadedByConversation.delete(key)
    loadedByConversation.set(key, next)
    while (loadedByConversation.size > MAX_TRACKED_CONVERSATIONS) {
        const oldest = loadedByConversation.keys().next().value
        if (oldest === undefined || oldest === key) break
        loadedByConversation.delete(oldest)
    }
    notify()
    return true
}

/** Skills this conversation has already loaded, oldest first. */
export function loadedSkillsFor(conversationId?: string | null): string[] {
    const key = conversationKey(conversationId)
    if (!key) return []
    const known = loadedByConversation.get(key)
    return known ? [...known] : []
}

/**
 * Drop a conversation's memory (a cleared transcript is a new context: the tools
 * it lists are no longer in the log the model can read).
 */
export function forgetLoadedSkills(conversationId?: string | null): void {
    const key = conversationKey(conversationId)
    if (!key || !loadedByConversation.delete(key)) return
    notify()
}

/** Current change counter — the `useSyncExternalStore` snapshot. */
export function loadedSkillsVersion(): number {
    return version
}

/** Subscribe to load events (any conversation). */
export function subscribeLoadedSkills(listener: () => void): () => void {
    listeners.add(listener)
    return () => {
        listeners.delete(listener)
    }
}

/** Test/reset hook: forget every conversation. */
export function clearLoadedSkillCache(): void {
    if (loadedByConversation.size === 0) return
    loadedByConversation.clear()
    notify()
}
