/**
 * Renderer registries — the plugin-contributed UI for tool results.
 *
 * The kernel resolves component references; the plugins own the components.
 * Lookups are scope-agnostic: whatever tool/artifact a run produces, its card
 * is available on any surface.
 */

import { useMemo } from 'react'
import type { ComponentType } from 'react'
import { useAgentCapabilities } from './use-agent-capabilities'
import type { AgentArtifact, AgentArtifactProps, AgentToolResultProps } from '../plugin-agent'

/** Conversation cards by tool name (later plugins win on conflict). */
export function useAgentToolRenderers(): Map<string, ComponentType<AgentToolResultProps>> {
    const capabilities = useAgentCapabilities()
    return useMemo(() => {
        const map = new Map<string, ComponentType<AgentToolResultProps>>()
        for (const renderer of capabilities.toolRenderers) {
            map.set(renderer.tool, renderer.render)
        }
        return map
    }, [capabilities])
}

/** Result → artifact mappers by tool wire name (data half of the pipeline). */
export function useAgentToolArtifactMappers(): Map<string, (result: unknown, args: unknown) => AgentArtifact | null> {
    const capabilities = useAgentCapabilities()
    return useMemo(() => {
        const map = new Map<string, (result: unknown, args: unknown) => AgentArtifact | null>()
        // Tool implementations own the data mapping…
        for (const tool of capabilities.tools) {
            if (tool.artifactFromResult) map.set(tool.wireName, tool.artifactFromResult)
        }
        // …and a renderer may fill the gap for a tool the plugin does not own
        // (backend builtins, legacy editor tools).
        for (const renderer of capabilities.toolRenderers) {
            if (!renderer.artifactFromResult) continue
            if (!map.has(renderer.tool)) map.set(renderer.tool, renderer.artifactFromResult)
        }
        return map
    }, [capabilities])
}

/** Side-sheet previews by artifact kind. */
export function useAgentArtifactRenderers(): Map<string, ComponentType<AgentArtifactProps>> {
    const capabilities = useAgentCapabilities()
    return useMemo(() => {
        const map = new Map<string, ComponentType<AgentArtifactProps>>()
        for (const renderer of capabilities.artifactRenderers) {
            map.set(renderer.kind, renderer.render)
        }
        return map
    }, [capabilities])
}
