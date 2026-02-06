/**
 * Skill Management Tools
 *
 * Tools for installing, uninstalling, and managing user skills.
 * Works with both online marketplace and local imports.
 */

import { z } from '@kn/ui'
import type { ToolsRecord, ReloadCallback } from '../types'
import type { SkillRegistry, SerializableSkill } from '../skills/skill-registry'

export interface SkillManagementContext {
    skillRegistry: SkillRegistry
    onReload?: ReloadCallback
}

/**
 * Create skill management tools
 */
export function createSkillManagementTools(context: SkillManagementContext): ToolsRecord {
    const { skillRegistry, onReload } = context

    return {
        /**
         * List installed skills
         */
        listInstalledSkills: {
            description: `列出用户已安装的技能。返回所有已安装技能的详细信息。`,
            inputSchema: z.object({
                filter: z.enum(['all', 'enabled', 'disabled'])
                    .optional()
                    .describe('筛选条件: all=全部, enabled=已启用, disabled=已禁用')
            }),
            execute: async ({ filter = 'all' }: { filter?: string }) => {
                let skills = skillRegistry.getInstalled()

                switch (filter) {
                    case 'enabled':
                        skills = skills.filter(s => s.enabled)
                        break
                    case 'disabled':
                        skills = skills.filter(s => !s.enabled)
                        break
                }

                return {
                    total: skillRegistry.getInstalled().length,
                    enabled: skillRegistry.getEnabled().length,
                    filter,
                    skills: skills.map(skill => ({
                        id: skill.id,
                        name: skill.name,
                        displayName: skill.displayName,
                        description: skill.description,
                        version: skill.version,
                        author: skill.author,
                        enabled: skill.enabled,
                        source: skill.source,
                        installedAt: skill.installedAt,
                        requiredTools: skill.requiredTools,
                        tags: skill.tags
                    }))
                }
            }
        },

        /**
         * Install a skill from JSON definition
         */
        installSkill: {
            description: `安装一个新的技能。支持从 JSON 定义安装。
技能 JSON 格式示例:
{
  "id": "my-skill",
  "name": "my-skill",
  "displayName": "My Skill",
  "description": "技能描述",
  "version": "1.0.0",
  "requiredTools": ["tool1", "tool2"],
  "systemPromptFragment": "专用指令..."
}`,
            inputSchema: z.object({
                skillJson: z.string().describe('技能的 JSON 定义'),
                source: z.enum(['marketplace', 'custom', 'import'])
                    .optional()
                    .describe('技能来源'),
                sourceUrl: z.string().optional().describe('技能来源 URL（可选）')
            }),
            execute: async ({
                skillJson,
                source = 'custom',
                sourceUrl
            }: {
                skillJson: string
                source?: 'marketplace' | 'custom' | 'import'
                sourceUrl?: string
            }) => {
                const result = await skillRegistry.importFromJson(skillJson)

                if (result.success) {
                    // Update source info
                    if (result.skill && (source !== 'import' || sourceUrl)) {
                        await skillRegistry.update(result.skill.id, {})
                        const skill = skillRegistry.get(result.skill.id)
                        if (skill) {
                            skill.source = source
                            skill.sourceUrl = sourceUrl
                        }
                    }
                    onReload?.()
                }

                return {
                    ...result,
                    hint: result.success
                        ? '技能已安装，使用 activateSkill 激活它'
                        : '请检查 JSON 格式是否正确'
                }
            }
        },

        /**
         * Install skill from URL
         */
        installSkillFromUrl: {
            description: `从 URL 安装技能。URL 应返回有效的技能 JSON 定义。`,
            inputSchema: z.object({
                url: z.string().describe('技能 JSON 的 URL 地址')
            }),
            execute: async ({ url }: { url: string }) => {
                try {
                    const response = await fetch(url)
                    if (!response.ok) {
                        return {
                            success: false,
                            message: `Failed to fetch skill: HTTP ${response.status}`
                        }
                    }

                    const skillJson = await response.text()
                    const result = await skillRegistry.importFromJson(skillJson)

                    if (result.success && result.skill) {
                        // Update source info
                        await skillRegistry.update(result.skill.id, {})
                        const skill = skillRegistry.get(result.skill.id)
                        if (skill) {
                            skill.source = 'marketplace'
                            skill.sourceUrl = url
                        }
                        onReload?.()
                    }

                    return {
                        ...result,
                        sourceUrl: url,
                        hint: result.success
                            ? '技能已从 URL 安装'
                            : '请检查 URL 是否正确'
                    }
                } catch (error) {
                    return {
                        success: false,
                        message: `Failed to install skill from URL: ${error}`
                    }
                }
            }
        },

        /**
         * Uninstall a skill
         */
        uninstallSkill: {
            description: `卸载已安装的技能。`,
            inputSchema: z.object({
                skillId: z.string().describe('要卸载的技能 ID')
            }),
            execute: async ({ skillId }: { skillId: string }) => {
                const result = await skillRegistry.uninstall(skillId)

                if (result.success) {
                    onReload?.()
                }

                return result
            }
        },

        /**
         * Enable/disable a skill
         */
        toggleSkillEnabled: {
            description: `启用或禁用已安装的技能。禁用后技能将不会被自动加载。`,
            inputSchema: z.object({
                skillId: z.string().describe('技能 ID'),
                enabled: z.boolean().describe('是否启用')
            }),
            execute: async ({ skillId, enabled }: { skillId: string; enabled: boolean }) => {
                const result = await skillRegistry.setEnabled(skillId, enabled)

                if (result.success) {
                    onReload?.()
                }

                return result
            }
        },

        /**
         * Export a skill to JSON
         */
        exportSkill: {
            description: `导出已安装的技能为 JSON 格式，方便分享给其他用户。`,
            inputSchema: z.object({
                skillId: z.string().describe('要导出的技能 ID')
            }),
            execute: async ({ skillId }: { skillId: string }) => {
                const json = skillRegistry.exportToJson(skillId)

                if (!json) {
                    return {
                        success: false,
                        message: `Skill "${skillId}" not found`
                    }
                }

                return {
                    success: true,
                    skillId,
                    json,
                    hint: '可以将此 JSON 分享给其他用户安装'
                }
            }
        },

        /**
         * Create a new custom skill
         */
        createCustomSkill: {
            description: `创建一个新的自定义技能。指定所需工具和专用指令。`,
            inputSchema: z.object({
                name: z.string().describe('技能名称（唯一标识符，英文）'),
                displayName: z.string().describe('技能显示名称'),
                description: z.string().describe('技能描述'),
                requiredTools: z.array(z.string()).describe('必需的工具列表'),
                optionalTools: z.array(z.string()).optional().describe('可选的工具列表'),
                systemPromptFragment: z.string().optional().describe('专用 System Prompt 片段'),
                tags: z.array(z.string()).optional().describe('标签列表')
            }),
            execute: async ({
                name,
                displayName,
                description,
                requiredTools,
                optionalTools,
                systemPromptFragment,
                tags
            }: {
                name: string
                displayName: string
                description: string
                requiredTools: string[]
                optionalTools?: string[]
                systemPromptFragment?: string
                tags?: string[]
            }) => {
                const skill: SerializableSkill = {
                    id: `custom-${name}-${Date.now()}`,
                    name,
                    displayName,
                    description,
                    version: '1.0.0',
                    requiredTools,
                    optionalTools,
                    systemPromptFragment,
                    tags,
                    createdAt: new Date().toISOString()
                }

                const result = await skillRegistry.install(skill, 'custom')

                if (result.success) {
                    onReload?.()
                }

                return {
                    ...result,
                    skill: result.success ? skill : undefined,
                    hint: result.success
                        ? '自定义技能已创建，使用 activateSkill 激活它'
                        : undefined
                }
            }
        }
    }
}

/**
 * Get skill management tools metadata
 */
export function getSkillManagementToolsMetadata() {
    return [
        {
            name: 'listInstalledSkills',
            category: 'discovery' as const,
            description: '列出用户已安装的技能',
            priority: 8,
            tags: ['skill', 'installed', 'list'],
            loaded: true,
            source: 'builtin' as const
        },
        {
            name: 'installSkill',
            category: 'discovery' as const,
            description: '从 JSON 安装技能',
            priority: 8,
            tags: ['skill', 'install', 'json'],
            loaded: true,
            source: 'builtin' as const
        },
        {
            name: 'installSkillFromUrl',
            category: 'discovery' as const,
            description: '从 URL 安装技能',
            priority: 8,
            tags: ['skill', 'install', 'url'],
            loaded: true,
            source: 'builtin' as const
        },
        {
            name: 'uninstallSkill',
            category: 'discovery' as const,
            description: '卸载技能',
            priority: 8,
            tags: ['skill', 'uninstall', 'remove'],
            loaded: true,
            source: 'builtin' as const
        },
        {
            name: 'toggleSkillEnabled',
            category: 'discovery' as const,
            description: '启用或禁用技能',
            priority: 8,
            tags: ['skill', 'enable', 'disable'],
            loaded: true,
            source: 'builtin' as const
        },
        {
            name: 'exportSkill',
            category: 'discovery' as const,
            description: '导出技能为 JSON',
            priority: 7,
            tags: ['skill', 'export', 'share'],
            loaded: true,
            source: 'builtin' as const
        },
        {
            name: 'createCustomSkill',
            category: 'discovery' as const,
            description: '创建自定义技能',
            priority: 8,
            tags: ['skill', 'create', 'custom'],
            loaded: true,
            source: 'builtin' as const
        }
    ]
}
