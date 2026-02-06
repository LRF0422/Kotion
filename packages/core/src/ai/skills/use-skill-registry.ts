/**
 * React Hook for Skill Registry
 *
 * Provides reactive access to the skill registry with auto-refresh on changes.
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
    SkillRegistry,
    createSkillRegistry,
    InstalledSkill,
    SerializableSkill,
    SkillStorageAdapter
} from './skill-registry'

export interface UseSkillRegistryOptions {
    apiBase?: string
    getHeaders?: () => Record<string, string>
    forceLocal?: boolean
    storage?: SkillStorageAdapter
}

export interface UseSkillRegistryReturn {
    // State
    skills: InstalledSkill[]
    enabledSkills: InstalledSkill[]
    loading: boolean
    error: Error | null

    // Actions
    install: (skill: SerializableSkill, source?: InstalledSkill['source'], sourceUrl?: string) => Promise<{ success: boolean; message: string }>
    installFromJson: (json: string) => Promise<{ success: boolean; message: string }>
    installFromUrl: (url: string) => Promise<{ success: boolean; message: string }>
    uninstall: (skillId: string) => Promise<{ success: boolean; message: string }>
    setEnabled: (skillId: string, enabled: boolean) => Promise<{ success: boolean; message: string }>
    refresh: () => Promise<void>
    exportToJson: (skillId: string) => string | null

    // Registry instance (for advanced use)
    registry: SkillRegistry
}

// Singleton registry instance
let globalRegistry: SkillRegistry | null = null
let globalRegistryOptions: UseSkillRegistryOptions | null = null

/**
 * Get or create the global skill registry
 */
export function getSkillRegistry(options?: UseSkillRegistryOptions): SkillRegistry {
    // Check if options changed
    const optionsChanged = JSON.stringify(options) !== JSON.stringify(globalRegistryOptions)

    if (!globalRegistry || optionsChanged) {
        if (options?.storage) {
            globalRegistry = new SkillRegistry(options.storage)
        } else {
            globalRegistry = createSkillRegistry(options)
        }
        globalRegistryOptions = options || null
    }

    return globalRegistry
}

/**
 * React hook for skill registry
 */
export function useSkillRegistry(options?: UseSkillRegistryOptions): UseSkillRegistryReturn {
    const registry = useMemo(() => getSkillRegistry(options), [
        options?.apiBase,
        options?.forceLocal
    ])

    const [skills, setSkills] = useState<InstalledSkill[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<Error | null>(null)

    // Load skills on mount
    useEffect(() => {
        let mounted = true

        const loadSkills = async () => {
            try {
                setLoading(true)
                await registry.initialize()
                if (mounted) {
                    setSkills(registry.getInstalled())
                    setError(null)
                }
            } catch (err) {
                if (mounted) {
                    setError(err instanceof Error ? err : new Error(String(err)))
                }
            } finally {
                if (mounted) {
                    setLoading(false)
                }
            }
        }

        loadSkills()

        // Subscribe to changes
        const unsubscribe = registry.subscribe(() => {
            if (mounted) {
                setSkills(registry.getInstalled())
            }
        })

        return () => {
            mounted = false
            unsubscribe()
        }
    }, [registry])

    // Actions
    const install = useCallback(async (
        skill: SerializableSkill,
        source?: InstalledSkill['source'],
        sourceUrl?: string
    ) => {
        return registry.install(skill, source, sourceUrl)
    }, [registry])

    const installFromJson = useCallback(async (json: string) => {
        return registry.importFromJson(json)
    }, [registry])

    const installFromUrl = useCallback(async (url: string) => {
        try {
            const response = await fetch(url)
            if (!response.ok) {
                return {
                    success: false,
                    message: `Failed to fetch: HTTP ${response.status}`
                }
            }
            const json = await response.text()
            const result = await registry.importFromJson(json)

            if (result.success && result.skill) {
                await registry.update(result.skill.id, {})
                const skill = registry.get(result.skill.id)
                if (skill) {
                    skill.source = 'marketplace'
                    skill.sourceUrl = url
                }
            }

            return result
        } catch (err) {
            return {
                success: false,
                message: `Failed to install: ${err}`
            }
        }
    }, [registry])

    const uninstall = useCallback(async (skillId: string) => {
        return registry.uninstall(skillId)
    }, [registry])

    const setEnabled = useCallback(async (skillId: string, enabled: boolean) => {
        return registry.setEnabled(skillId, enabled)
    }, [registry])

    const refresh = useCallback(async () => {
        setLoading(true)
        try {
            await registry.initialize()
            setSkills(registry.getInstalled())
        } finally {
            setLoading(false)
        }
    }, [registry])

    const exportToJson = useCallback((skillId: string) => {
        return registry.exportToJson(skillId)
    }, [registry])

    const enabledSkills = useMemo(() => skills.filter(s => s.enabled), [skills])

    return {
        skills,
        enabledSkills,
        loading,
        error,
        install,
        installFromJson,
        installFromUrl,
        uninstall,
        setEnabled,
        refresh,
        exportToJson,
        registry
    }
}

/**
 * Initialize the skill registry (call early in app lifecycle)
 */
export async function initializeSkillRegistry(options?: UseSkillRegistryOptions): Promise<SkillRegistry> {
    const registry = getSkillRegistry(options)
    await registry.initialize()
    return registry
}
