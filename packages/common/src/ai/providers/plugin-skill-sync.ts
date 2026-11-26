/**
 * Keep the skill catalog in step with the plugin registry.
 *
 * A plugin's skills reach the agent through the shared {@link SkillProvider}, and
 * a plugin can be replaced under a running window — the plugin studio's hot
 * reload swaps it in place, and installing/uninstalling has the same effect. So
 * the plugin-skill set has to be **authoritative**, not append-only.
 *
 * `SkillProvider.registerSkills` is last-write-wins *by name*: it refreshes a
 * skill whose definition changed, but it can never drop one the new build no
 * longer contributes. That is how a renamed skill kept answering next to its
 * replacement — and, together with the wiring bug this module was added for
 * (the capability hook refreshed on `PLUGIN_CHANGED`, which a dev build
 * deliberately never emits), why "refresh the plugin, ask the agent again" could
 * still show the previous build's capability until some unrelated editor rebind
 * happened to re-register.
 *
 * A name that also belongs to a user-installed skill (which the plugin was
 * shadowing) is restored from `fallback` rather than dropped: the plugin was the
 * last writer, not the only one.
 */

import type { Skill } from '../types'
import type { SkillProvider } from './SkillProvider'

export interface PluginSkillSyncResult {
    /**
     * Names the plugin registry contributes now. Carry this into the next call
     * as `previous`; it is also the set of names this helper owns.
     */
    names: Set<string>
    /** Contributed now but not before. */
    added: string[]
    /** Contributed before AND now, with a different definition. */
    updated: string[]
    /** Contributed before and dropped by the new registry state. */
    removed: string[]
}

/**
 * Stable identity of a skill's *content* — everything that reaches the catalog
 * (`SkillProvider` adds `id` / `displayName`, which are derived from `name`, so
 * they are not part of the comparison).
 *
 * Used to skip a no-op re-registration: every registration bumps the provider's
 * version and invalidates the memoized capability catalog, and this is called on
 * every registry change and editor rebind.
 */
function definitionKey(skill: Skill): string {
    return JSON.stringify({
        name: skill.name,
        description: skill.description,
        requiredTools: [...(skill.requiredTools ?? [])],
        optionalTools: [...(skill.optionalTools ?? [])],
        systemPromptFragment: skill.systemPromptFragment ?? '',
        tags: [...(skill.tags ?? [])],
        domain: skill.domain ?? '',
        source: skill.source,
        pluginName: skill.pluginName ?? '',
    })
}

/**
 * Make `provider`'s plugin-sourced skills match `next`.
 *
 * @param options.previous names returned by the previous call (empty on mount).
 * @param options.fallback other sources' skills, read only when a removed name
 *   has to be restored; pass the user-installed snapshot rather than calling it
 *   eagerly — removals are the rare case.
 */
export function syncPluginSkills(options: {
    provider: SkillProvider
    next: readonly Skill[]
    previous: ReadonlySet<string>
    fallback?: () => readonly Skill[]
}): PluginSkillSyncResult {
    const { provider, next, previous, fallback } = options
    // Last declaration wins on a name collision (the provider stores one entry
    // per name), so collapse first: one registration, one report entry.
    const nextByName = new Map(next.map(skill => [skill.name, skill] as const))
    const names = new Set(nextByName.keys())
    const removed: string[] = []

    // Drop first: a skill the new build renamed must not survive next to its
    // replacement, and a provider entry is registered under the bare name.
    const removable = Array.from(previous).filter(name => !names.has(name))
    if (removable.length > 0) {
        const byName = new Map((fallback?.() ?? []).map(skill => [skill.name, skill] as const))
        for (const name of removable) {
            const restored = byName.get(name)
            if (restored) {
                // The plugin had shadowed another source's skill of the same
                // name; put that one back instead of leaving a hole.
                provider.registerSkill(restored)
            } else {
                provider.unregisterSkill(name)
            }
            removed.push(name)
        }
    }

    const added: string[] = []
    const updated: string[] = []
    for (const skill of nextByName.values()) {
        const current = provider.getSkill(skill.name)
        if (!current) {
            provider.registerSkill(skill)
            added.push(skill.name)
            continue
        }
        // A user-installed skill can win the name at runtime (the registry
        // subscription re-registers it); the plugin's current declaration still
        // wins over that here, exactly like the first registration did.
        if (definitionKey(current) === definitionKey(skill)) continue
        provider.registerSkill(skill)
        updated.push(skill.name)
    }

    return { names, added, updated, removed }
}