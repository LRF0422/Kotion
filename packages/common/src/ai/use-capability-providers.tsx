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
 * Editor retargeting: the ToolProvider is created ONCE and rebound to whichever
 * editor is active via {@link rebindEditor}. That is the single source of truth
 * for the live tool map, so moving the conversation's off-screen edit target
 * (editPage) never recreates the catalog — it only swaps the editor the tools
 * act on, synchronously, for both built-in and plugin tools.
 *
 * `editor` may be null (e.g. the global system agent before an editor is
 * bound); built-in tools are still advertised, but their execution will fail
 * until a real editor is provided.
 */

import { AppContext } from "../core/AppContext"
import type { Editor } from "@tiptap/core"
import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { event, PLUGIN_CHANGED } from "../event"

import type { OnToolExecution, OnUserChoiceRequest, ToolsRecord, ToolDefinition } from "./types"
import { ToolProvider } from "./providers/ToolProvider"
import { SkillProvider } from "./providers/SkillProvider"
import { collectCapabilityCatalog, isReadOnlyTool, type CapabilityCatalog } from "./capabilities"
import { builtinSkills, getSkillRegistry } from "./skills"
import { wrapToolsWithCallback } from "./utils/tool-wrapper"
import { getSessionPageBinding, type SessionPageBinding } from "./session-page-binding"

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
    /** All executable tools (unwrapped) for the current editor. */
    allTools: ToolsRecord
    /**
     * Rebind every tool (built-in AND plugin) to `nextEditor` synchronously
     * and return the live tool map. This is the one entry point for
     * retargeting: React calls it when the active editor changes, and the chat
     * calls it before an editPage tool returns so later calls in the same
     * backend batch already act on the new page.
     */
    rebindEditor: (nextEditor: Editor | null) => ToolsRecord
    /**
     * Stable executor resolver. Without an owner it returns the tools bound to
     * the conversation's current editor (identity never changes, so a tool that
     * switches the target mid-batch is honoured by the next call). With an owner
     * (a delegated sub-run id) it returns tools bound to **that agent's** editor
     * when the host exposes one, so a child can never edit the parent's document.
     */
    resolveTools: (
        owner?: string | null,
        options?: { mutating?: boolean }
    ) => ToolsRecord | Promise<ToolsRecord>
    /**
     * Build (or return the cached) tool record bound to an arbitrary editor,
     * without touching the active catalog. Exposed for hosts that manage
     * per-agent editors themselves.
     */
    buildToolsForEditor: (targetEditor: any) => ToolsRecord
    /** Read-only classification of a tool (write-lease decision). */
    isReadOnlyTool: (name: string) => boolean
    /** The editor the active catalog is bound to. */
    getEditor: () => any
}

export function useCapabilityProviders(
    editor: Editor | null,
    options?: {
        onToolExecution?: OnToolExecution
        onUserChoiceRequest?: OnUserChoiceRequest
        /**
         * Host edit-target binding. Defaults to the global registry for
         * backward compatibility; hosts should pass their own so this hook no
         * longer depends on a module-level singleton.
         */
        sessionBinding?: () => SessionPageBinding | null
    }
): CapabilityProviders {
    const { pluginManager } = useContext(AppContext)
    const onToolExecution = options?.onToolExecution
    const onUserChoiceRequest = options?.onUserChoiceRequest

    // Resolved through a ref so an identity-unstable getter (or a host that
    // registers its binding after mount) never recreates callbacks.
    const sessionBindingRef = useRef(options?.sessionBinding ?? getSessionPageBinding)
    sessionBindingRef.current = options?.sessionBinding ?? getSessionPageBinding

    // Version state for reactive updates when the catalog changes.
    const [version, setVersion] = useState(0)

    // Cached capability catalog; invalidated whenever providers change.
    const catalogRef = useRef<CapabilityCatalog | null>(null)

    // Reload callback — invalidates the catalog and triggers re-render.
    const handleReload = useCallback(() => {
        catalogRef.current = null
        setVersion(v => v + 1)
    }, [])

    // The choice callback is read through a ref so an inline (identity-unstable)
    // callback can never recreate the provider — which would otherwise loop with
    // the rebind layout effect. The provider itself is created once and rebound
    // to the active editor by the layout effect below.
    const onUserChoiceRequestRef = useRef(onUserChoiceRequest)
    onUserChoiceRequestRef.current = onUserChoiceRequest
    const toolProvider = useMemo(() => {
        return new ToolProvider({
            editor: null,
            // Delegate through a ref so an identity-unstable callback cannot
            // recreate the provider (which would loop with the rebind layout
            // effect). With no host handler, askUserChoice fails clearly.
            onUserChoiceRequest: (request: any) => {
                const handler = onUserChoiceRequestRef.current
                if (!handler) return Promise.reject(new Error('No user-choice handler available'))
                return handler(request)
            },
            onReload: handleReload
        })
    }, [handleReload])

    // Skill registry (singleton).
    const skillRegistry = useMemo(() => getSkillRegistry(), [])

    // Create SkillProvider instance (pure catalog — no pluginManager needed).
    const skillProvider = useMemo(() => {
        const provider = new SkillProvider({ onReload: handleReload })
        provider.registerSkills(builtinSkills)
        return provider
    }, [handleReload])

    // Latest editor for callbacks that fire outside a React render (plugin
    // change events). Updated during render, read lazily.
    const editorRef = useRef<Editor | null>(editor)
    editorRef.current = editor

    /**
     * Tool records built for delegated agents' editors, keyed by editor instance.
     * Building one runs every tool factory plus plugin resolution, and an agent's
     * editor is stable for the life of its target, so cache per instance.
     */
    const perEditorToolsRef = useRef<WeakMap<object, ToolsRecord>>(new WeakMap())

    /** Plugin skills are editor-independent; register them whenever they change. */
    const registerPluginSkills = useCallback(() => {
        if (!pluginManager) return
        const pluginSkills = pluginManager.resolveSkills?.() || []
        if (pluginSkills.length > 0) {
            console.log('[Agent] Registering plugin skills:', pluginSkills.map(s => s.name))
            skillProvider.registerSkills(pluginSkills)
        }
    }, [pluginManager, skillProvider])

    /**
     * Plugin tools grouped by the extension that owns them. Keeps the per-plugin
     * `pluginName` metadata of the active catalog intact, and — resolving against
     * an explicit editor — is also what per-agent tool builds reuse.
     */
    const collectPluginToolsByPlugin = useCallback((targetEditor: Editor | null): Array<{ pluginName: string; tools: ToolsRecord }> => {
        if (!pluginManager || !targetEditor) return []
        const allPluginTools = pluginManager.resolveTools?.(targetEditor) || {}
        const extensions = pluginManager.resolveEditorExtensions?.() || []
        const groups: Array<{ pluginName: string; tools: ToolsRecord }> = []
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
                groups.push({ pluginName: ext.name, tools: filtered })
            }
        }
        return groups
    }, [pluginManager])

    /**
     * Rebind built-in + plugin tools to `nextEditor`, synchronously, and return
     * the resulting tool map. Plugin tools are resolved against the *new*
     * editor here rather than restored from the previous provider, so a stale
     * plugin tool can never mutate the previous page.
     */
    const rebindEditor = useCallback((nextEditor: Editor | null): ToolsRecord => {
        toolProvider.updateEditor(nextEditor)
        registerPluginSkills()
        // A rebind may pick up different plugin tools; per-editor builds cached
        // for delegated agents must not keep serving the previous instances.
        perEditorToolsRef.current = new WeakMap()

        for (const group of collectPluginToolsByPlugin(nextEditor)) {
            console.log(`[Agent] Registering ${Object.keys(group.tools).length} tools from plugin "${group.pluginName}"`)
            toolProvider.registerPluginTools(group.tools, group.pluginName)
        }
        return toolProvider.getAllTools()
    }, [toolProvider, pluginManager, registerPluginSkills, collectPluginToolsByPlugin])

    /**
     * Build (or reuse) the tool record bound to an arbitrary editor: the same
     * sources as the active catalog (core factories + plugin extension tools),
     * but nothing is registered and no metadata/version is touched. This is what
     * gives a delegated agent its own editor binding.
     */
    const buildToolsForEditor = useCallback((targetEditor: any): ToolsRecord => {
        if (!targetEditor) return toolProvider.getAllTools()
        const cached = perEditorToolsRef.current.get(targetEditor)
        if (cached) return cached

        const record = toolProvider.buildToolsFor(targetEditor)
        for (const group of collectPluginToolsByPlugin(targetEditor)) {
            Object.assign(record, group.tools)
        }
        perEditorToolsRef.current.set(targetEditor, record)
        return record
    }, [toolProvider, collectPluginToolsByPlugin])

    /**
     * Read-only classification for the write lease: the tool's own flag wins,
     * otherwise its catalog category decides (same rule the run catalog uses).
     */
    const isReadOnlyToolName = useCallback((name: string): boolean => {
        return isReadOnlyTool(toolProvider.getToolMetadata(name), toolProvider.getToolExecutor(name))
    }, [toolProvider])

    /** The editor the active catalog is bound to. */
    const getEditor = useCallback(() => toolProvider.getEditor(), [toolProvider])

    // Rebind on every active-editor change. useLayoutEffect (not useEffect) so
    // the tools are already pointing at the new editor before the auto-execute
    // effect and the next paint — there is no window in which a tool call could
    // still target the previous editor.
    useLayoutEffect(() => {
        rebindEditor(editor)
    }, [rebindEditor, editor])
    // Register plugin skills + tools when plugins are loaded/changed, against
    // the editor that is active at that moment.
    useEffect(() => {
        const onPluginChanged = () => { rebindEditor(editorRef.current) }
        registerPluginSkills()
        event.on(PLUGIN_CHANGED, onPluginChanged)
        return () => {
            event.off(PLUGIN_CHANGED, onPluginChanged)
        }
    }, [rebindEditor, registerPluginSkills])

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

    // Stable: reads the live provider map at call time, so a target switch made
    // earlier in the same backend tool batch is visible to the next call. An
    // owner (delegated sub-run) resolves to that agent's own editor when the
    // host exposes one; a child that never retargeted inherits the parent's.
    // The async branch only runs when the owner has a target whose editor is
    // not ready yet — never silently fall back to another document for it.
    const resolveTools = useCallback((
        owner?: string | null,
        options?: { mutating?: boolean }
    ): ToolsRecord | Promise<ToolsRecord> => {
        if (!owner) return toolProvider.getAllTools()
        const binding = sessionBindingRef.current()
        const activeEditor = toolProvider.getEditor()
        const ownerEditor = binding?.getEditorFor?.(owner)
        if (ownerEditor) {
            return ownerEditor === activeEditor
                ? toolProvider.getAllTools()
                : buildToolsForEditor(ownerEditor)
        }
        if (!binding?.getEditorForAsync) return toolProvider.getAllTools()
        return binding.getEditorForAsync(owner, options).then(editor => (
            editor && editor !== activeEditor
                ? buildToolsForEditor(editor)
                : toolProvider.getAllTools()
        ))
    }, [toolProvider, buildToolsForEditor])

    return {
        toolProvider,
        skillProvider,
        skillRegistry,
        version,
        getCatalog,
        resolveTool,
        allTools,
        rebindEditor,
        resolveTools,
        buildToolsForEditor,
        isReadOnlyTool: isReadOnlyToolName,
        getEditor,
    }
}
