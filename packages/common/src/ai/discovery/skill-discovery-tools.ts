/**
 * Skill Discovery APIs
 *
 * These tools allow the AI agent to discover, activate, and deactivate skills.
 * Skills are high-level capabilities that combine multiple tools with specialized prompts.
 */

import { z } from "zod"
import type { ToolsRecord, ReloadCallback } from '../types'
import type { SkillProvider } from '../providers/SkillProvider'
import type { ToolProvider } from '../providers/ToolProvider'

export interface SkillDiscoveryContext {
    skillProvider: SkillProvider
    toolProvider?: ToolProvider
    onReload?: ReloadCallback
}

/**
 * Create skill discovery tools
 */
export function createSkillDiscoveryTools(context: SkillDiscoveryContext): ToolsRecord {
    const { skillProvider, toolProvider, onReload } = context

    return {
        /**
         * Discover all available capabilities - tools AND skills in one call.
         * This is the RECOMMENDED first step before any task.
         */
        discoverCapabilities: {
            description: `一次性发现所有可用能力（工具分类和技能列表）。这是每次任务开始前的推荐第一步，帮助你了解当前可用的完整能力范围。
返回工具分类概览和所有可用技能。`,
            inputSchema: z.object({}),
            execute: async () => {
                // Gather tool categories
                const toolCategories = toolProvider
                    ? (() => {
                        const categories = toolProvider.getCategories()
                        const loadedCount = toolProvider.getLoadedToolNames().length
                        const totalCount = toolProvider.getAllMetadata().length
                        return {
                            totalTools: totalCount,
                            loadedTools: loadedCount,
                            categories: categories.map(c => ({
                                category: c.category,
                                description: c.description,
                                toolCount: c.toolCount,
                                loadedCount: c.loadedCount
                            })),
                            hint: '使用 exploreCategory 或 searchAvailableTools 查看具体分类下的工具，使用 loadTool 加载需要的工具'
                        }
                    })()
                    : null

                // Gather skills
                const allSkills = skillProvider.getAllSkills()
                const activeSkillNames = skillProvider.getActiveSkills()

                const skills = allSkills.map(skill => ({
                    name: skill.name,
                    description: skill.description,
                    active: skill.active,
                    requiredTools: skill.requiredTools,
                    source: skill.source,
                    tags: skill.tags || []
                }))

                // Separate pre-activated skills from available ones
                const preActivated = skills.filter(s => s.active)
                const available = skills.filter(s => !s.active)

                return {
                    toolCategories,
                    preActivatedSkills: preActivated.length > 0
                        ? {
                            count: preActivated.length,
                            list: preActivated.map(s => ({ name: s.name, description: s.description, tags: s.tags })),
                            note: 'These skills are already loaded and ready to use — no activation needed'
                        }
                        : null,
                    availableSkills: {
                        total: available.length,
                        list: available
                    },
                    summary: `${allSkills.length} skills total, ${preActivated.length} pre-activated, ${available.length} available for activation`,
                    hint: preActivated.length > 0
                        ? '已有预激活的技能可直接使用。如需更多能力，使用 activateSkill 激活其他技能'
                        : '根据用户意图，使用 activateSkill 激活匹配的技能，然后使用 exploreCategory/searchAvailableTools/loadTool 获取所需工具'
                }
            }
        },

        /**
         * List all available skills
         */
        listSkills: {
            description: `列出所有可用的技能。技能是高层能力抽象，组合多个工具和专用指令来完成复杂任务。
返回技能列表及其描述、所需工具和激活状态。`,
            inputSchema: z.object({
                filter: z.enum(['all', 'active', 'inactive', 'builtin', 'plugin'])
                    .optional()
                    .describe('筛选条件: all=全部, active=已激活, inactive=未激活, builtin=内置, plugin=插件')
            }),
            execute: async ({ filter = 'all' }: { filter?: string }) => {
                let skills = skillProvider.getAllSkills()

                // Apply filter
                switch (filter) {
                    case 'active':
                        skills = skills.filter(s => s.active)
                        break
                    case 'inactive':
                        skills = skills.filter(s => !s.active)
                        break
                    case 'builtin':
                        skills = skills.filter(s => s.source === 'builtin')
                        break
                    case 'plugin':
                        skills = skills.filter(s => s.source === 'plugin')
                        break
                }

                const activeCount = skillProvider.getActiveSkills().length
                const totalCount = skillProvider.getAllSkills().length

                return {
                    summary: `共 ${totalCount} 个技能，已激活 ${activeCount} 个`,
                    filter,
                    skills: skills.map(skill => ({
                        name: skill.name,
                        description: skill.description,
                        active: skill.active,
                        requiredTools: skill.requiredTools,
                        optionalTools: skill.optionalTools || [],
                        source: skill.source,
                        tags: skill.tags || []
                    })),
                    hint: '使用 activateSkill 激活技能，激活后将获得专用指令和所需工具'
                }
            }
        },

        /**
         * Activate a skill
         */
        activateSkill: {
            description: `激活指定的技能。激活技能会:
1. 自动加载该技能所需的所有工具
2. 添加技能专用的系统指令
3. 使你能够执行该技能的复杂任务

适用于需要执行复杂任务时，如文档重构、内容分析等。`,
            inputSchema: z.object({
                skillName: z.string().describe('要激活的技能名称'),
                skipOptional: z.boolean().optional().describe('是否跳过加载可选工具')
            }),
            execute: async ({ skillName, skipOptional }: { skillName: string; skipOptional?: boolean }) => {
                const result = skillProvider.activateSkill(skillName, { skipOptional })

                if (result.success) {
                    onReload?.()
                }

                return {
                    ...result,
                    hint: result.success
                        ? `技能 "${skillName}" 已激活，你现在可以使用相关工具和指令`
                        : '请使用 listSkills 查看可用技能'
                }
            }
        },

        /**
         * Deactivate a skill
         */
        deactivateSkill: {
            description: `停用指定的技能。停用技能会:
1. 移除技能专用的系统指令
2. 工具保持已加载状态（不会卸载）

当不再需要某个技能的专用指令时使用。`,
            inputSchema: z.object({
                skillName: z.string().describe('要停用的技能名称')
            }),
            execute: async ({ skillName }: { skillName: string }) => {
                const result = skillProvider.deactivateSkill(skillName)

                if (result.success) {
                    onReload?.()
                }

                return {
                    ...result,
                    hint: result.success
                        ? `技能 "${skillName}" 已停用`
                        : '请使用 listSkills 查看已激活的技能'
                }
            }
        }
    }
}

/**
 * Get skill discovery tools metadata
 */
export function getSkillDiscoveryToolsMetadata() {
    return [
        {
            name: 'discoverCapabilities',
            category: 'discovery' as const,
            description: '一次性发现所有可用能力（工具+技能）',
            priority: 10,
            tags: ['discovery', 'capabilities', 'essential', 'first-step'],
            loaded: true,
            source: 'builtin' as const
        },
        {
            name: 'listSkills',
            category: 'discovery' as const,
            description: '列出所有可用的技能',
            priority: 9,
            tags: ['skill', 'discovery', 'list'],
            loaded: true,
            source: 'builtin' as const
        },
        {
            name: 'activateSkill',
            category: 'discovery' as const,
            description: '激活指定的技能',
            priority: 9,
            tags: ['skill', 'activate', 'load'],
            loaded: true,
            source: 'builtin' as const
        },
        {
            name: 'deactivateSkill',
            category: 'discovery' as const,
            description: '停用指定的技能',
            priority: 9,
            tags: ['skill', 'deactivate', 'unload'],
            loaded: true,
            source: 'builtin' as const
        }
    ]
}
