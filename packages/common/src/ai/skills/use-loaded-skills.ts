/**
 * React binding for the session-scoped loaded-skill memory.
 *
 * `buildAgentRunInputs` is called inside a `useMemo`, so a skill loaded mid-run
 * must invalidate that memo: the NEXT turn's request is built from the render
 * that follows, and `useEditorAgent.start` captures the tool arrays from that
 * render. Without a subscription the arrays would stay as they were on mount and
 * every turn would re-ship the skill as "learn it yourself".
 */

import { useMemo, useSyncExternalStore } from 'react'
import { loadedSkillsFor, loadedSkillsVersion, subscribeLoadedSkills } from './loaded-skill-cache'

/**
 * The skills this conversation has already loaded. The returned array is a fresh
 * snapshot per version (safe as a `useMemo` dependency), and changes only when a
 * skill is loaded/forgotten on this conversation.
 */
export function useLoadedSkills(conversationId?: string | null): string[] {
    const version = useSyncExternalStore(
        subscribeLoadedSkills,
        loadedSkillsVersion,
        loadedSkillsVersion,
    )
    return useMemo(
        () => loadedSkillsFor(conversationId),
        [conversationId, version],
    )
}
