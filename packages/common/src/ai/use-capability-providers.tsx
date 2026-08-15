/**
 * useCapabilityProviders
 *
 * Shared React wiring that builds and maintains the frontend capability
 * catalog (skills + tools) for the agent. Both the editor agent hook and the
 * system-agent provider consume this so the provider/plugin/skill-registry
 * plumbing lives in exactly one place.
 *
 * The frontend ships the full catalog inline with every chat request; the
 * backend performs progressive discovery/activation. This hook owns:
 *  - a {@link ToolProvider} (built-in + plugin tools, executable locally)
 *  - a {@link SkillProvider} (built-in + installed + plugin skills)
 *  - the skill-registry subscription and plugin (PLUGIN_CHANGED) wiring
 *  - a cached {@link CapabilityCatalog} and a `resolveTool` executor lookup
 *
 * `editor` may be null (e.g. the global system agent before an editor is
 * bound); built-in tools are still advertised, but their execution will fail
 * until a real editor is provided.
 */

import { AppContext } from "../core/AppContext"
import type { Editor } from "@tiptap/core"
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { event, PLUGIN_CHANGED } from "../event"

import type { OnToolExecution, OnUserChoiceRequest, ToolsRecord, ToolDefinition } from "./types"
import { ToolProvider } from "./providers/ToolProvider"
import { SkillProvider } from "./providers/SkillProvider"
import { collectCapabilityCatalog, type CapabilityCatalog } from "./capabilities"
import { builtinSkills, getSkillRegistry } from "./skills"
import { wrapToolsWithCallback } from "./utils/tool-wrapper"

export interface CapabilityProviders {
    toolProvider: ToolProvider
    skillProvider: SkillProvider
    skillRegistry: ReturnType<typeof getSkillRegistry>
    /** Bumped whenever the catalog changes; use to trigger re-renders. */
    version: number
    /**
     * Build (or return cached) capability catalog for the current providers.
     * Pass an optional active-skill set to ship only the skills the user has
     * toggled on (the catalog is the activation surface).
     */
    getCatalog: (activeSkills?: Set<string>) => CapabilityCatalog
    /** Resolve a tool executor (wrapped with execution tracking) by name. */
    resolveTool: (name: string) => ToolDefinition | undefined
    /** All executable tools (unwrapped). */
    allTools: ToolsRecord
}

export function useCapabilityProviders(
    editor: Editor | null,
    options?: {
        onToolExecution?: OnToolExecution
        onUserChoiceRequest?: OnUserChoiceRequest
    }
): CapabilityProviders {
    const { pluginManager } = useContext(AppContext)
    const onToolExecution = options?.onToolExecution
    const onUserChoiceRequest = options?.onUserChoiceRequest

    // Version state for reactive updates when the catalog changes.
    const [version, setVersion] = useState(0)

    // Cached capability catalog; invalidated whenever providers change.
    const catalogRef = useRef<CapabilityCatalog | null>(null)

    // Reload callback — invalidates the catalog and triggers re-render.
    const handleReload = useCallback(() => {
        catalogRef.current = null
        setVersion(v => v + 1)
    }, [])

    // Create ToolProvider instance (rebuilt when the editor changes).
    const toolProvider = useMemo(() => {
        return new ToolProvider({
            editor,
            onUserChoiceRequest,
            onReload: handleReload
        })
    }, [editor, onUserChoiceRequest, handleReload])

    // Skill registry (singleton).
    const skillRegistry = useMemo(() => getSkillRegistry(), [])

    // Create SkillProvider instance (pure catalog — no pluginManager needed).
    const skillProvider = useMemo(() => {
        const provider = new SkillProvider({ onReload: handleReload })
        provider.registerSkills(builtinSkills)
        return provider
    }, [handleReload])

    // Initialize skill registry and load installed skills.
    useEffect(() => {
        let mounted = true

        const loadInstalledSkills = async () => {
            try {
                await skillRegistry.initialize()
                if (mounted) {
                    const installedSkills = skillRegistry.toSkillFormat()
                    if (installedSkills.length > 0) {
                        skillProvider.registerSkills(installedSkills)
                    }
                }
            } catch (error) {
                console.error('Failed to load installed skills:', error)
            }
        }

        loadInstalledSkills()

        const unsubscribe = skillRegistry.subscribe(() => {
            if (mounted) {
                const installedSkills = skillRegistry.toSkillFormat()
                skillProvider.registerSkills(installedSkills)
            }
        })

        return () => {
            mounted = false
            unsubscribe()
        }
    }, [skillRegistry, skillProvider])

    // Register plugin skills + plugin tools when plugins are loaded/changed.
    // Plugin tools are registered eagerly so the backend can see them in the
    // catalog and request their execution.
    useEffect(() => {
        const registerPluginCapabilities = () => {
            if (!pluginManager) return

            // Plugin skills don't require an editor.
            const pluginSkills = pluginManager.resolveSkills?.() || []
            if (pluginSkills.length > 0) {
                console.log('[Agent] Registering plugin skills:', pluginSkills.map(s => s.name))
                skillProvider.registerSkills(pluginSkills)
            }

            // Plugin tools require an editor to instantiate.
            if (!editor) return
            const allPluginTools = pluginManager.resolveTools?.(editor) || {}
            const extensions = pluginManager.resolveEditorExtensions?.() || []
            for (const ext of extensions) {
                const toolNames = ext.tools
                    ? (Array.isArray(ext.tools) ? ext.tools : [ext.tools]).map((t: any) => t.name)
                    : []
                if (toolNames.length === 0) continue

                const filtered: ToolsRecord = {}
                for (const name of toolNames) {
                    if (allPluginTools[name]) filtered[name] = allPluginTools[name]
                }
                if (Object.keys(filtered).length > 0) {
                    console.log(`[Agent] Registering ${Object.keys(filtered).length} tools from plugin "${ext.name}"`)
                    toolProvider.registerPluginTools(filtered, ext.name)
                }
            }
        }

        registerPluginCapabilities()
        event.on(PLUGIN_CHANGED, registerPluginCapabilities)
        return () => {
            event.off(PLUGIN_CHANGED, registerPluginCapabilities)
        }
    }, [pluginManager, skillProvider, toolProvider, editor])

    // Eagerly-instantiated tool catalog for local execution of backend tool calls.
    const allTools = useMemo(() => {
        return toolProvider.getAllTools()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [toolProvider, version])

    // Wrap tools with callback (for frontend-side execution tracking).
    const wrappedTools = useMemo(() => {
        return wrapToolsWithCallback(allTools, onToolExecution)
    }, [allTools, onToolExecution])

    // Rebuild the capability catalog whenever providers change (cached via ref).
    const getCatalog = useCallback((activeSkills?: Set<string>): CapabilityCatalog => {
        if (!catalogRef.current) {
            catalogRef.current = collectCapabilityCatalog(skillProvider, toolProvider)
        }
        if (!activeSkills || activeSkills.size === 0) {
            return catalogRef.current
        }
        // Skill activation lives in the catalog: only toggled-on skills (and
        // their tool payloads) are shipped to the backend.
        return {
            ...catalogRef.current,
            skills: catalogRef.current.skills.filter(s => activeSkills.has(s.name)),
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [skillProvider, toolProvider, version])

    const resolveTool = useCallback(
        (name: string): ToolDefinition | undefined => wrappedTools[name] || allTools[name],
        [wrappedTools, allTools]
    )

    return {
        toolProvider,
        skillProvider,
        skillRegistry,
        version,
        getCatalog,
        resolveTool,
        allTools,
    }
}
