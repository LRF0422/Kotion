/**
 * Turning raw awareness states into the collaborators a person should see.
 *
 * A page's collaboration room routinely contains clients that are not people.
 * The hidden `OffscreenEditorHost` sessions the AI agent edits through join the
 * same room with the *same user identity* the human has, so an untreated
 * awareness list counts the hidden session as a second collaborator: a page the
 * agent has touched then shows that person twice and reads as "being co-edited",
 * which does not go away on its own — the chat / workbench surface holds those
 * hidden sessions alive for as long as the conversation targets the page.
 *
 * Two rules, applied in one place:
 * - a hidden agent session never counts as a collaborator
 *   ({@link AGENT_AWARENESS_FIELD});
 * - one person appears once, however many of their own windows/tabs are
 *   connected (the floating page window, a second tab, a stale entry).
 *
 * This is deliberately a read-side rule: the hidden session keeps publishing its
 * normal awareness (the write lease and host-presence hooks need it), it simply
 * is not shown as if a human were sitting in the page.
 */

/**
 * Awareness field a hidden, automation-driven editor marks itself with.
 *
 * Published by `OffscreenEditorHost`; read by {@link isHiddenAgentAwareness}.
 * The two must agree, so the constant (not a string literal) crosses the
 * package boundary.
 */
export const AGENT_AWARENESS_FIELD = 'agentSession'

/** The slice of an awareness state this module needs, declared structurally. */
export interface AwarenessStateLike {
    clientId?: number | string
    user?: CollaboratorUser | null
    [field: string]: unknown
}

/** The profile a client publishes in awareness (`user`). */
export interface CollaboratorUser {
    id?: string | number | null
    name?: string | null
    avatar?: string | null
    [field: string]: unknown
}

/** One collaborator, as the presence UI renders it. */
export interface PresentCollaborator {
    clientId?: number | string
    user: CollaboratorUser
}

/** Whether this awareness state belongs to a hidden, automation-driven editor. */
export function isHiddenAgentAwareness(
    state: AwarenessStateLike | null | undefined,
): boolean {
    return state?.[AGENT_AWARENESS_FIELD] === true
}

/**
 * Who this person is, independent of which client published it.
 *
 * The id is authoritative; the name is the fallback for clients that only carry
 * a display name, and the client id is the last resort so two anonymous clients
 * are still told apart.
 */
const identityOf = (entry: PresentCollaborator): string => {
    const id = entry.user.id
    if (id !== undefined && id !== null && String(id) !== '') return `id:${String(id)}`
    if (entry.user.name) return `name:${entry.user.name}`
    return `client:${String(entry.clientId)}`
}

/**
 * The collaborators to show: hidden agent sessions dropped, one entry per person.
 *
 * Order is first-appearance order, which is what makes the avatar group stable
 * between awareness updates.
 */
export function presentCollaborators(
    states: readonly AwarenessStateLike[],
): PresentCollaborator[] {
    const byIdentity = new Map<string, PresentCollaborator>()

    for (const state of states) {
        if (!state || isHiddenAgentAwareness(state)) continue
        // States without a user are housekeeping entries (cursor, role, ...).
        if (!state.user) continue

        const entry: PresentCollaborator = { clientId: state.clientId, user: state.user }
        const key = identityOf(entry)
        const existing = byIdentity.get(key)
        // Prefer the copy carrying the avatar: the same person's clients differ
        // only in how much profile data reached awareness, and the avatar group
        // should draw the richest one. `Map.set` on an existing key keeps the
        // original position, so the order does not flicker.
        if (!existing || (!existing.user.avatar && entry.user.avatar)) {
            byIdentity.set(key, entry)
        }
    }

    return [...byIdentity.values()]
}
