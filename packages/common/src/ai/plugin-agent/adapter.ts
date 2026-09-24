/**
 * Legacy adapter: `editorExtension[].tools / .skills` → {@link AgentContribution}.
 *
 * Existing plugins keep working with zero changes. Legacy tools stay
 * **un-namespaced** (decision 2: the adapter preserves the names the model
 * already knows) and are `scope: 'page'`: they come from Tiptap extensions and
 * are document tools, so they can only run with a live editor. Declaring them
 * `'any'` advertised them in workspace scope where the factory silently closed
 * over an undefined editor, and the call failed later with
 * "Cannot read properties of undefined (reading 'state')".
 *
 * @deprecated Author new capabilities on `PluginConfig.agent` instead.
 */

import type { ExtensionWrapper } from '../../core/editor'
import type { AgentContribution, AgentSkillDefinition, AgentToolDefinition } from './types'

export function legacyExtensionToAgentContribution(ext: ExtensionWrapper): AgentContribution {
    const contribution: AgentContribution = {}

    if (ext.tools && ext.tools.length > 0) {
        contribution.tools = ext.tools
            .filter(tool => !!tool && !!tool.name)
            .map<AgentToolDefinition>(tool => ({
                name: tool.name,
                description: tool.description,
                inputSchema: tool.inputSchema,
                readOnly: tool.readOnly,
                scope: 'page',
                namespace: false,
                artifactFromResult: tool.artifactFromResult,
                // Call the legacy factory EAGERLY. Guard the editor explicitly:
                // most legacy factories only CLOSE OVER the editor and return a
                // working-looking executor, so without this check an editor-less
                // scope would register tools that fail at call time.
                create: (ctx) => {
                    if (!ctx.editor) {
                        throw new Error(`Tool ${tool.name} requires a live editor`)
                    }
                    const executor = (tool.execute as any)(ctx.editor)
                    return (params: any, callId?: string, execCtx?: any) =>
                        typeof executor === 'function' ? executor(params, callId, execCtx) : executor
                },
            }))
    }

    if (ext.skills && ext.skills.length > 0) {
        contribution.skills = ext.skills
            .filter(skill => !!skill && !!skill.name)
            .map<AgentSkillDefinition>(skill => ({
                name: skill.name,
                description: skill.description,
                requiredTools: skill.requiredTools ?? [],
                optionalTools: skill.optionalTools,
                systemPromptFragment: skill.systemPromptFragment,
                tags: skill.tags,
            }))
    }

    return contribution
}
