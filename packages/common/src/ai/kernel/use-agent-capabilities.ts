/**
 * useAgentCapabilities — reactive view over the plugin capability registry.
 *
 * The kernel agent is a capability *aggregator*: a surface asks this hook
 * "what do the currently installed plugins contribute at this scope?" and
 * re-renders when plugins are installed or uninstalled (PluginManager.onChange
 * via usePluginState).
 */

import { useContext, useMemo } from 'react'
import { AppContext } from '../../core/AppContext'
import { usePluginState } from '../../hooks/use-plugin-state'
import type {
    ResolvedAgentCapabilities,
    ResolvedAgentScope,
} from '../plugin-agent'

/** Scope a kernel surface runs in — never `any`. */
export type KernelScope = ResolvedAgentScope

const EMPTY_CAPABILITIES: ResolvedAgentCapabilities = {
    tools: [], skills: [], context: [], actions: [], agents: [],
    toolRenderers: [], artifactRenderers: [],
}

/**
 * @param scope Omit to read every scope (used by scope-agnostic consumers such
 *              as the result-card / sheet renderer registries).
 */
export function useAgentCapabilities(scope?: KernelScope): ResolvedAgentCapabilities {
    const { pluginManager } = useContext(AppContext)
    const { pluginVersion } = usePluginState()

    return useMemo(() => {
        if (!pluginManager?.resolveAgentCapabilities) return EMPTY_CAPABILITIES
        try {
            return pluginManager.resolveAgentCapabilities(scope)
        } catch (error) {
            console.warn('[Agent] Capability resolution failed:', error)
            return EMPTY_CAPABILITIES
        }
        // Plugin changes bump pluginVersion; scope changes re-select.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pluginManager, pluginVersion, scope])
}
