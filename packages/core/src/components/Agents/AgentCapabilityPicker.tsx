/**
 * 自定义 Agent 的「技能与工具」配置器。
 *
 * 两种模式：
 *  - `all`（默认）：这个 Agent 使用当前界面的全部技能与工具，与旧行为一致；
 *  - `custom`：手动勾选一个白名单 —— 只勾选一部分技能/工具，Agent 就只拿到这些。
 *
 * 两条规则在这里落地，和后端/运行侧完全一致：
 *  1. 勾选一个技能会自动带上它声明的工具（必需 + 可选）。因此工具列表里这些行
 *     显示为「来自技能 X」且不能单独取消 —— 否则技能说明里写的工具会调不到。
 *  2. 从「全部」切到「手动选择」时预选当前全部能力，用户是「取消掉不要的」，
 *     而不是从零开始配置：切换模式本身不应该悄悄削减 Agent 的能力。
 */

import React, { useCallback, useMemo, useState } from 'react'
import {
    Badge,
    Checkbox,
    Input,
    Label,
    cn,
} from '@kn/ui'
import { Search, Sparkles } from '@kn/icon'
import {
    SKILL_DISCOVERY_TOOL_NAME,
    normalizeSkillKey,
    unavailableCapabilityNames,
    useTranslation,
    type AgentCapabilityCatalog,
    type SkillPayload,
} from '@kn/common'

export type AgentCapabilityMode = 'all' | 'custom'

export interface AgentCapabilitySelection {
    mode: AgentCapabilityMode
    /** Explicitly enabled skill names. */
    skills: string[]
    /** Explicitly enabled tool names (tools owned by enabled skills are implicit). */
    tools: string[]
}

export interface AgentCapabilityPickerProps {
    /** Live skills/tools of this environment; null while they are still loading. */
    catalog: Pick<AgentCapabilityCatalog, 'skills' | 'tools'> | null
    value: AgentCapabilitySelection
    onChange: (next: AgentCapabilitySelection) => void
    disabled?: boolean
}

type Tab = 'skills' | 'tools'

/**
 * Skill references are folded (`Doc Review` ≈ `doc-review`) on both sides: a
 * config written by an older version or by hand still maps onto the live skill.
 */
const skillKey = (name: string) => normalizeSkillKey(name)

/** Tool → enabling skill name (the tool is implicit, not individually toggleable). */
function impliedToolsOf(skills: readonly SkillPayload[], enabled: readonly string[]): Map<string, string> {
    const enabledSet = new Set(enabled.map(skillKey))
    const implied = new Map<string, string>()
    for (const skill of skills) {
        if (!enabledSet.has(skillKey(skill.name))) continue
        for (const name of [...(skill.requiredTools ?? []), ...(skill.optionalTools ?? [])]) {
            if (!implied.has(name)) implied.set(name, skill.name)
        }
    }
    return implied
}

export const AgentCapabilityPicker: React.FC<AgentCapabilityPickerProps> = ({
    catalog,
    value,
    onChange,
    disabled,
}) => {
    const { t } = useTranslation()
    const [tab, setTab] = useState<Tab>('skills')
    const [query, setQuery] = useState('')
    const [onlySelected, setOnlySelected] = useState(false)

    const allSkills = catalog?.skills ?? []
    const allTools = catalog?.tools ?? []

    const selectedSkillSet = useMemo(() => new Set(value.skills.map(skillKey)), [value.skills])
    const impliedTools = useMemo(
        () => impliedToolsOf(allSkills, value.skills),
        [allSkills, value.skills],
    )
    /**
     * Kept by the runtime whenever a skill is enabled: the skill's fragment and
     * tool schemas arrive through `load_skill`. Mirrored here so the list and the
     * count show exactly what the run will get.
     */
    const autoKeptTools = useMemo(
        () => new Set(value.skills.length > 0 ? [SKILL_DISCOVERY_TOOL_NAME] : []),
        [value.skills.length],
    )
    const selectedToolSet = useMemo(() => {
        const set = new Set(value.tools)
        for (const name of impliedTools.keys()) set.add(name)
        for (const name of autoKeptTools) set.add(name)
        return set
    }, [value.tools, impliedTools, autoKeptTools])

    /**
     * Counted against the LIVE catalog: a tool that was configured but is not
     * installed (or a plugin that is disabled) never reaches the run, so the
     * count must not promise it.
     */
    const effectiveToolCount = useMemo(
        () => allTools.filter(tool => selectedToolSet.has(tool.function.name)).length,
        [allTools, selectedToolSet],
    )

    /** Switch modes without silently dropping capabilities (see module comment). */
    const changeMode = useCallback((mode: AgentCapabilityMode) => {
        if (mode === value.mode) return
        if (mode === 'all') {
            onChange({ mode: 'all', skills: [], tools: [] })
            return
        }
        // 全部 → 手动：预选全部技能；工具只显式勾选「没有技能认领」的那些，
        // 技能自带的工具由技能隐式带上，列表里依然显示为已启用。
        const skillNames = allSkills.map(skill => skill.name)
        const owned = impliedToolsOf(allSkills, skillNames)
        onChange({
            mode: 'custom',
            skills: skillNames,
            tools: allTools
                .map(tool => tool.function.name)
                .filter(name => !owned.has(name)),
        })
    }, [value.mode, onChange, allSkills, allTools])

    const toggleSkill = useCallback((skill: SkillPayload) => {
        const key = skillKey(skill.name)
        const enabled = selectedSkillSet.has(key)
        const nextSkills = enabled
            ? value.skills.filter(name => skillKey(name) !== key)
            : [...value.skills, skill.name]
        // 勾上技能时把它自带的工具从「显式勾选」里移出，避免用户取消技能后工具
        // 仍被悄悄留着；取消技能时工具本来就没有显式勾选，自然一起失效。
        const owned = new Set([...(skill.requiredTools ?? []), ...(skill.optionalTools ?? [])])
        const nextTools = enabled ? value.tools : value.tools.filter(name => !owned.has(name))
        onChange({ mode: 'custom', skills: nextSkills, tools: nextTools })
    }, [value, selectedSkillSet, onChange])

    const toggleTool = useCallback((name: string) => {
        if (impliedTools.has(name) || autoKeptTools.has(name)) return
        const enabled = value.tools.includes(name)
        onChange({
            mode: 'custom',
            skills: value.skills,
            tools: enabled
                ? value.tools.filter(item => item !== name)
                : [...value.tools, name],
        })
    }, [value, impliedTools, autoKeptTools, onChange])

    /** 技能来源标签：内置 / 已安装（用户 SKILL.md）/ 插件。 */
    const skillSourceLabel = (skill: SkillPayload): string => {
        if (skill.source === 'builtin') {
            return t('settings.agents.capabilities.sourceBuiltin', { defaultValue: '内置' })
        }
        if (skill.source === 'user') {
            return t('settings.agents.capabilities.sourceUser', { defaultValue: '已安装' })
        }
        return skill.pluginName
            ? t('settings.agents.capabilities.sourcePluginNamed', {
                defaultValue: '插件 · {{name}}',
                name: skill.pluginName.replace(/^user:/, ''),
            })
            : t('settings.agents.capabilities.sourcePlugin', { defaultValue: '插件' })
    }

    const normalizedQuery = query.trim().toLowerCase()
    const matches = useCallback((name: string, description?: string) => {
        return !normalizedQuery
            || name.toLowerCase().includes(normalizedQuery)
            || (description ?? '').toLowerCase().includes(normalizedQuery)
    }, [normalizedQuery])

    const visibleSkills = useMemo(
        () => allSkills.filter(skill =>
            matches(skill.name, skill.description)
            && (!onlySelected || selectedSkillSet.has(skillKey(skill.name)))),
        [allSkills, matches, onlySelected, selectedSkillSet],
    )
    const visibleTools = useMemo(
        () => allTools.filter(tool =>
            matches(tool.function.name, tool.function.description)
            && (!onlySelected || selectedToolSet.has(tool.function.name))),
        [allTools, matches, onlySelected, selectedToolSet],
    )

    /**
     * A catalog with neither skills nor tools is not "everything is off" — it is
     * an environment that could not report its capabilities. Saying so beats a
     * silent chat-only agent.
     */
    const catalogUnavailable = !!catalog && allSkills.length === 0 && allTools.length === 0

    /** Configured names this environment cannot offer (uninstalled skill/plugin). */
    const missing = useMemo(() => {
        if (value.mode !== 'custom') return [] as string[]
        const gone = unavailableCapabilityNames({ skills: allSkills, tools: allTools }, value)
        return [...gone.skills, ...gone.tools]
    }, [value, allSkills, allTools])

    const list = tab === 'skills' ? visibleSkills : visibleTools
    // Counts are shown for BOTH tabs, so the user sees the effect of enabling a
    // skill on the tool side without switching tabs.
    const selectedSkillCount = allSkills
        .filter(skill => selectedSkillSet.has(skillKey(skill.name))).length

    const selectAll = useCallback(() => {
        if (tab === 'skills') {
            const names = allSkills
                .filter(skill => matches(skill.name, skill.description))
                .map(skill => skill.name)
            // De-duplicate by folded key: `Doc Review` and `doc-review` are the
            // same skill, and a duplicate would show up twice in the summary.
            const merged: string[] = []
            const seen = new Set<string>()
            for (const name of [...value.skills, ...names]) {
                const key = skillKey(name)
                if (!key || seen.has(key)) continue
                seen.add(key)
                merged.push(name)
            }
            const owned = impliedToolsOf(allSkills, merged)
            onChange({
                mode: 'custom',
                skills: merged,
                tools: value.tools.filter(name => !owned.has(name)),
            })
            return
        }
        const names = allTools
            .map(tool => tool.function.name)
            .filter(name => !impliedTools.has(name) && !autoKeptTools.has(name))
        onChange({ mode: 'custom', skills: value.skills, tools: [...new Set([...value.tools, ...names])] })
    }, [tab, allSkills, allTools, value, matches, impliedTools, autoKeptTools, onChange])

    const clear = useCallback(() => {
        if (tab === 'skills') {
            // 清空技能 = 该 Agent 不使用任何技能；原本显式勾选的工具保留，由用户
            // 在工具页决定（它们不再被技能隐式覆盖）。
            onChange({ mode: 'custom', skills: [], tools: value.tools })
            return
        }
        onChange({ mode: 'custom', skills: value.skills, tools: [] })
    }, [tab, value, onChange])

    return (
        <div className="mt-8">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <Label className="text-xs font-medium text-muted-foreground">
                        {t('settings.agents.capabilities.title', { defaultValue: '技能与工具' })}
                    </Label>
                    <span className="text-[11px] text-muted-foreground/70">
                        {value.mode === 'custom'
                            ? t('settings.agents.capabilities.summaryCustom', {
                                defaultValue: '{{skills}} 个技能 · {{tools}} 个工具',
                                skills: selectedSkillCount,
                                tools: effectiveToolCount,
                            })
                            : t('settings.agents.capabilities.summaryAll', { defaultValue: '全部可用能力' })}
                    </span>
                </div>
                <div
                    role="group"
                    aria-label={t('settings.agents.capabilities.title', { defaultValue: '技能与工具' })}
                    className="flex items-center rounded-full border border-border/70 bg-muted/40 p-0.5"
                >
                    {(['all', 'custom'] as const).map(mode => (
                        <button
                            key={mode}
                            type="button"
                            disabled={disabled}
                            aria-pressed={value.mode === mode}
                            onClick={() => changeMode(mode)}
                            className={cn(
                                'rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
                                value.mode === mode
                                    ? 'bg-background text-foreground shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground',
                            )}
                        >
                            {mode === 'all'
                                ? t('settings.agents.capabilities.modeAll', { defaultValue: '全部' })
                                : t('settings.agents.capabilities.modeCustom', { defaultValue: '手动选择' })}
                        </button>
                    ))}
                </div>
            </div>

            <div className="mt-2 rounded-xl border border-border/70 p-3">
                {value.mode === 'all' ? (
                    <p className="text-xs leading-relaxed text-muted-foreground">
                        {t('settings.agents.capabilities.allHint', {
                            defaultValue: '这个 Agent 可以使用当前界面的全部技能与工具。想让它更专一（例如只读审稿），切到「手动选择」再取消不要的项。',
                        })}
                    </p>
                ) : !catalog ? (
                    <p className="py-3 text-center text-xs text-muted-foreground">
                        {t('settings.agents.capabilities.loading', { defaultValue: '正在读取可用能力…' })}
                    </p>
                ) : (
                    <div className="space-y-2.5">
                        {catalogUnavailable && (
                            <p className="text-[11px] leading-snug text-amber-600 dark:text-amber-500">
                                {t('settings.agents.capabilities.catalogUnavailable', {
                                    defaultValue: '当前环境没有提供技能/工具目录，手动白名单不会生效，这个 Agent 会使用全部可用能力。',
                                })}
                            </p>
                        )}
                        <div className="flex items-center gap-2">
                            <div className="relative flex-1">
                                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    value={query}
                                    disabled={disabled}
                                    placeholder={t('settings.agents.capabilities.search', {
                                        defaultValue: '搜索技能或工具',
                                    })}
                                    onChange={event => setQuery(event.target.value)}
                                    className="h-8 rounded-lg pl-8 text-xs"
                                />
                            </div>
                            <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
                                <Checkbox
                                    checked={onlySelected}
                                    disabled={disabled}
                                    onCheckedChange={checked => setOnlySelected(checked === true)}
                                    className="h-3.5 w-3.5"
                                />
                                {t('settings.agents.capabilities.onlySelected', { defaultValue: '只看已选' })}
                            </label>
                        </div>

                        <div className="flex items-center justify-between gap-2 border-b border-border/60">
                            <div className="flex items-center gap-1">
                                {(['skills', 'tools'] as const).map(item => (
                                    <button
                                        key={item}
                                        type="button"
                                        onClick={() => setTab(item)}
                                        aria-pressed={tab === item}
                                        className={cn(
                                            '-mb-px border-b-2 px-2 py-1.5 text-[11px] font-medium transition-colors',
                                            tab === item
                                                ? 'border-primary text-foreground'
                                                : 'border-transparent text-muted-foreground hover:text-foreground',
                                        )}
                                    >
                                        {item === 'skills'
                                            ? t('settings.agents.capabilities.skills', { defaultValue: '技能' })
                                            : t('settings.agents.capabilities.tools', { defaultValue: '工具' })}
                                        <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                                            {item === 'skills'
                                                ? `${selectedSkillCount}/${allSkills.length}`
                                                : `${effectiveToolCount}/${allTools.length}`}
                                        </span>
                                    </button>
                                ))}
                            </div>
                            <div className="flex items-center gap-2 text-[11px]">
                                <button
                                    type="button"
                                    disabled={disabled}
                                    onClick={selectAll}
                                    className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                                >
                                    {t('settings.agents.capabilities.selectAll', { defaultValue: '全选' })}
                                </button>
                                <span className="text-border">|</span>
                                <button
                                    type="button"
                                    disabled={disabled}
                                    onClick={clear}
                                    className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                                >
                                    {t('settings.agents.capabilities.clear', { defaultValue: '清空' })}
                                </button>
                            </div>
                        </div>

                        <div className="max-h-[236px] min-h-[112px] overflow-y-auto pr-1">
                            {list.length === 0 ? (
                                <p className="py-6 text-center text-xs text-muted-foreground">
                                    {t('settings.agents.capabilities.empty', { defaultValue: '没有匹配的项' })}
                                </p>
                            ) : tab === 'skills' ? (
                                visibleSkills.map(skill => {
                                    const checked = selectedSkillSet.has(skillKey(skill.name))
                                    const toolCount = skill.requiredTools.length + (skill.optionalTools?.length ?? 0)
                                    return (
                                        <label
                                            key={skill.name}
                                            className="flex cursor-pointer items-start gap-2 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-muted/50"
                                        >
                                            <Checkbox
                                                checked={checked}
                                                disabled={disabled}
                                                onCheckedChange={() => toggleSkill(skill)}
                                                className="mt-0.5 h-3.5 w-3.5"
                                            />
                                            <span className="min-w-0 flex-1">
                                                <span className="flex items-center gap-1.5">
                                                    <span className="truncate text-xs font-medium text-foreground">
                                                        {skill.name}
                                                    </span>
                                                    <Badge variant="secondary" className="h-4 shrink-0 px-1 text-[10px]">
                                                        {skillSourceLabel(skill)}
                                                    </Badge>
                                                    {toolCount > 0 && (
                                                        <span className="shrink-0 text-[10px] text-muted-foreground/70">
                                                            {t('settings.agents.capabilities.toolCount', {
                                                                defaultValue: '{{count}} 个工具',
                                                                count: toolCount,
                                                            })}
                                                        </span>
                                                    )}
                                                </span>
                                                <span className="mt-0.5 line-clamp-1 block text-[11px] leading-snug text-muted-foreground">
                                                    {skill.description}
                                                </span>
                                            </span>
                                        </label>
                                    )
                                })
                            ) : (
                                visibleTools.map(tool => {
                                    const name = tool.function.name
                                    const impliedBy = impliedTools.get(name)
                                    const autoKept = !impliedBy && autoKeptTools.has(name)
                                    const locked = !!impliedBy || autoKept
                                    const checked = selectedToolSet.has(name)
                                    return (
                                        <label
                                            key={name}
                                            className={cn(
                                                'flex items-start gap-2 rounded-lg px-1.5 py-1.5 transition-colors',
                                                locked ? 'cursor-default opacity-80' : 'cursor-pointer hover:bg-muted/50',
                                            )}
                                        >
                                            <Checkbox
                                                checked={checked}
                                                disabled={disabled || locked}
                                                onCheckedChange={() => toggleTool(name)}
                                                className="mt-0.5 h-3.5 w-3.5"
                                            />
                                            <span className="min-w-0 flex-1">
                                                <span className="flex items-center gap-1.5">
                                                    <span className="truncate font-mono text-[11px] font-medium text-foreground">
                                                        {name}
                                                    </span>
                                                    {tool.readOnly && (
                                                        <Badge variant="outline" className="h-4 shrink-0 px-1 text-[10px] text-muted-foreground">
                                                            {t('settings.agents.capabilities.readOnly', { defaultValue: '只读' })}
                                                        </Badge>
                                                    )}
                                                    {locked && (
                                                        <span className="inline-flex shrink-0 items-center gap-0.5 text-[10px] text-muted-foreground">
                                                            <Sparkles className="h-2.5 w-2.5" />
                                                            {impliedBy
                                                                ? t('settings.agents.capabilities.fromSkill', {
                                                                    defaultValue: '来自技能「{{skill}}」',
                                                                    skill: impliedBy,
                                                                })
                                                                : t('settings.agents.capabilities.autoKept', {
                                                                    defaultValue: '启用技能时自动保留',
                                                                })}
                                                        </span>
                                                    )}
                                                </span>
                                                <span className="mt-0.5 line-clamp-1 block text-[11px] leading-snug text-muted-foreground">
                                                    {tool.function.description}
                                                </span>
                                            </span>
                                        </label>
                                    )
                                })
                            )}
                        </div>

                        {missing.length > 0 && (
                            <p className="text-[11px] leading-snug text-amber-600 dark:text-amber-500">
                                {t('settings.agents.capabilities.missing', {
                                    defaultValue: '已配置但当前环境不可用：{{names}}',
                                    names: missing.slice(0, 6).join('、') + (missing.length > 6 ? '…' : ''),
                                })}
                            </p>
                        )}
                        {selectedSkillCount === 0 && effectiveToolCount === 0 && (
                            <p className="text-[11px] leading-snug text-amber-600 dark:text-amber-500">
                                {t('settings.agents.capabilities.chatOnly', {
                                    defaultValue: '没有选中任何技能或工具：这个 Agent 只能对话，不能读写文档。',
                                })}
                            </p>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}