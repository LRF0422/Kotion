/**
 * 自定义 Agent 管理面板
 *
 * 用户可以创建 / 编辑 / 删除自己的 Agent（名称 + 自定义指引），并选择当前
 * 生效的 Agent。指引会在前端 agent 每次创建 run 时附加到系统提示中。
 *
 * 新建/编辑用 Notion 风格的「个性化」弹窗：插画头像 + 左右切换、居中名称、
 * 可展开的指引输入、底部头像宫格。
 */

import React, { useCallback, useMemo, useState } from 'react'
import {
    AgentAvatar,
    AGENT_AVATARS,
    AGENT_AVATAR_IDS,
    DEFAULT_AGENT_AVATAR,
    Badge,
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Input,
    Label,
    Textarea,
    cn,
    toast,
} from '@kn/ui'
import { Bot, Check, ChevronLeft, ChevronRight, Loader2, Pencil, Plus, Trash2 } from '@kn/icon'
import {
    createCustomAgentId,
    useCustomAgents,
    useTranslation,
    type CustomAgent,
} from '@kn/common'
import { SettingsPanel, SettingsSection } from '../settings/components/primitives'

interface AgentDraft {
    id: string
    name: string
    avatar: string
    emoji: string
    description: string
    instructions: string
    createdAt: number
}

const EMPTY_DRAFT: AgentDraft = {
    id: '',
    name: '',
    avatar: DEFAULT_AGENT_AVATAR,
    emoji: '',
    description: '',
    instructions: '',
    createdAt: 0,
}

/** Pickers and cards share this: illustrated avatar first, emoji as fallback. */
const AgentGlyph: React.FC<{ avatar?: string; emoji?: string; className: string }> = ({
    avatar,
    emoji,
    className,
}) => {
    if (avatar) return <AgentAvatar id={avatar} className={className} />
    if (emoji) return <span aria-hidden className="leading-none">{emoji}</span>
    return <Bot className={className} />
}

export const AgentManager: React.FC = () => {
    const { t } = useTranslation()
    const {
        agents,
        selectedAgentId,
        loading,
        saving,
        error,
        saveAgent,
        deleteAgent,
        selectAgent,
    } = useCustomAgents()
    const [dialogOpen, setDialogOpen] = useState(false)
    const [draft, setDraft] = useState<AgentDraft>(EMPTY_DRAFT)
    const [initialDraft, setInitialDraft] = useState<AgentDraft>(EMPTY_DRAFT)
    const [instructionsEditing, setInstructionsEditing] = useState(false)
    const [pendingDelete, setPendingDelete] = useState<string | null>(null)

    const openCreate = useCallback(() => {
        const fresh = { ...EMPTY_DRAFT }
        setDraft(fresh)
        setInitialDraft(fresh)
        setInstructionsEditing(false)
        setDialogOpen(true)
    }, [])

    const openEdit = useCallback((agent: CustomAgent) => {
        const next: AgentDraft = {
            id: agent.id,
            name: agent.name,
            avatar: agent.avatar ?? '',
            emoji: agent.emoji ?? '',
            description: agent.description ?? '',
            instructions: agent.instructions,
            createdAt: agent.createdAt,
        }
        setDraft(next)
        setInitialDraft(next)
        setInstructionsEditing(next.instructions.trim().length > 0)
        setDialogOpen(true)
    }, [])

    const handleReset = useCallback(() => {
        setDraft(initialDraft)
        setInstructionsEditing(initialDraft.instructions.trim().length > 0)
    }, [initialDraft])

    const cycleAvatar = useCallback((delta: number) => {
        setDraft(prev => {
            const index = AGENT_AVATAR_IDS.indexOf(prev.avatar)
            const base = index >= 0 ? index : 0
            const next = (base + delta + AGENT_AVATAR_IDS.length) % AGENT_AVATAR_IDS.length
            return { ...prev, avatar: AGENT_AVATAR_IDS[next], emoji: '' }
        })
    }, [])

    const handleSubmit = useCallback(async () => {
        const name = draft.name.trim()
        const instructions = draft.instructions.trim()
        if (!name) {
            toast.error(t('settings.agents.nameRequired', { defaultValue: '请填写 Agent 名称' }))
            return
        }
        if (!instructions) {
            toast.error(t('settings.agents.instructionsRequired', { defaultValue: '请填写 Agent 指引' }))
            return
        }
        const now = Date.now()
        const agent: CustomAgent = {
            id: draft.id || createCustomAgentId(),
            name,
            avatar: draft.avatar || undefined,
            emoji: draft.avatar ? undefined : (draft.emoji || undefined),
            description: draft.description.trim() || undefined,
            instructions,
            createdAt: draft.createdAt || now,
            updatedAt: now,
        }
        await saveAgent(agent)
        setDialogOpen(false)
        toast.success(t('settings.agents.saved', { defaultValue: 'Agent 已保存' }))
    }, [draft, saveAgent, t])

    const handleDelete = useCallback(async (id: string) => {
        await deleteAgent(id)
        setPendingDelete(null)
        toast.success(t('settings.agents.deleted', { defaultValue: 'Agent 已删除' }))
    }, [deleteAgent, t])

    const selectedName = useMemo(
        () => agents.find(agent => agent.id === selectedAgentId)?.name ?? null,
        [agents, selectedAgentId],
    )

    return (
        <SettingsPanel>
            {/* 标题/描述由外层 SettingDlg 的页头统一渲染，这里只保留操作与列表，避免重复。 */}
            <SettingsSection
                action={
                    <Button size="sm" className="gap-1" onClick={openCreate} disabled={saving}>
                        <Plus className="h-3.5 w-3.5" />
                        {t('settings.agents.create', { defaultValue: '新建 Agent' })}
                    </Button>
                }
                bare
            >
                {loading ? (
                    <div className="flex items-center justify-center py-10 text-muted-foreground">
                        <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                ) : agents.length === 0 ? (
                    <button
                        type="button"
                        onClick={openCreate}
                        className="w-full rounded-xl border border-dashed border-border/70 px-4 py-10 text-center transition-colors hover:border-border hover:bg-muted/30"
                    >
                        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                            <Bot className="h-5 w-5" />
                        </div>
                        <p className="text-sm font-medium text-foreground">
                            {t('settings.agents.emptyTitle', { defaultValue: '还没有自定义 Agent' })}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                            {t('settings.agents.emptyDesc', {
                                defaultValue: '创建一个带名称和指引的 Agent，会话时就能选择它',
                            })}
                        </p>
                    </button>
                ) : (
                    <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60 bg-card">
                        {agents.map(agent => {
                            const active = agent.id === selectedAgentId
                            return (
                                <div key={agent.id} className="flex items-start gap-3 px-4 py-3">
                                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-base text-foreground">
                                        <AgentGlyph avatar={agent.avatar} emoji={agent.emoji} className="h-5 w-5 text-base" />
                                    </div>
                                    <div className="min-w-0 flex-1 space-y-0.5">
                                        <div className="flex items-center gap-2">
                                            <span className="truncate text-sm font-medium text-foreground">
                                                {agent.name}
                                            </span>
                                            {active && (
                                                <Badge variant="secondary" className="h-5 shrink-0 px-1.5 text-[10px]">
                                                    {t('settings.agents.inUse', { defaultValue: '使用中' })}
                                                </Badge>
                                            )}
                                        </div>
                                        {agent.description && (
                                            <p className="line-clamp-2 text-xs text-muted-foreground">
                                                {agent.description}
                                            </p>
                                        )}
                                        {agent.instructions && (
                                            <p className="line-clamp-1 text-xs text-muted-foreground/70">
                                                {agent.instructions}
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex shrink-0 items-center gap-1">
                                        <Button
                                            variant={active ? 'secondary' : 'ghost'}
                                            size="sm"
                                            className="h-8 gap-1 px-2 text-xs"
                                            disabled={active}
                                            onClick={() => selectAgent(agent.id)}
                                        >
                                            {active ? <Check className="h-3.5 w-3.5" /> : null}
                                            {active
                                                ? t('settings.agents.selected', { defaultValue: '已选择' })
                                                : t('settings.agents.use', { defaultValue: '使用' })}
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8"
                                            aria-label={t('settings.agents.edit', { defaultValue: '编辑' })}
                                            onClick={() => openEdit(agent)}
                                        >
                                            <Pencil className="h-3.5 w-3.5" />
                                        </Button>
                                        {pendingDelete === agent.id ? (
                                            <Button
                                                variant="destructive"
                                                size="sm"
                                                className="h-8 px-2 text-xs"
                                                disabled={saving}
                                                onClick={() => void handleDelete(agent.id)}
                                            >
                                                {t('settings.agents.confirmDelete', { defaultValue: '确认删除' })}
                                            </Button>
                                        ) : (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                                aria-label={t('settings.agents.delete', { defaultValue: '删除' })}
                                                onClick={() => setPendingDelete(agent.id)}
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
                {selectedName && (
                    <p className="text-xs text-muted-foreground">
                        {t('settings.agents.currentHint', {
                            name: selectedName,
                            defaultValue: '当前会话使用「{{name}}」，可在对话中随时切换。',
                        })}
                    </p>
                )}
                {error && (
                    <p className="text-xs text-destructive">
                        {t('settings.agents.saveError', {
                            defaultValue: '保存失败，已暂存到本地：{{error}}',
                            error,
                        })}
                    </p>
                )}
            </SettingsSection>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="max-h-[90vh] max-w-[700px] gap-0 overflow-y-auto p-0">
                    <DialogHeader className="px-6 pb-0 pt-6 sm:px-8">
                        <DialogTitle className="text-center text-base font-semibold">
                            {draft.id
                                ? t('settings.agents.editTitle', { defaultValue: '编辑 Agent' })
                                : t('settings.agents.personalizeTitle', { defaultValue: '个性化你的 Agent' })}
                        </DialogTitle>
                        <DialogDescription className="sr-only">
                            {t('settings.agents.dialogDesc', {
                                defaultValue: '选择头像和名称，并写一段指引来规定这个 Agent 的行为。',
                            })}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="px-6 pb-5 pt-6 sm:px-8">
                        {/* 头像 + 左右切换 */}
                        <div className="flex items-center justify-center gap-6">
                            <button
                                type="button"
                                aria-label={t('settings.agents.prevEmoji', { defaultValue: '上一个头像' })}
                                onClick={() => cycleAvatar(-1)}
                                className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            >
                                <ChevronLeft className="h-5 w-5" />
                            </button>
                            <div className="flex h-[80px] w-[80px] items-center justify-center rounded-full border border-border bg-muted/40 text-foreground shadow-sm">
                                {draft.avatar ? (
                                    <AgentAvatar id={draft.avatar} className="h-[52px] w-[52px]" />
                                ) : (
                                    <span aria-hidden className="text-4xl">{draft.emoji}</span>
                                )}
                            </div>
                            <button
                                type="button"
                                aria-label={t('settings.agents.nextEmoji', { defaultValue: '下一个头像' })}
                                onClick={() => cycleAvatar(1)}
                                className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            >
                                <ChevronRight className="h-5 w-5" />
                            </button>
                        </div>

                        {/* 名称 */}
                        <div className="mt-6 flex justify-center">
                            <Input
                                value={draft.name}
                                maxLength={60}
                                placeholder={t('settings.agents.namePlaceholder', { defaultValue: '输入名称' })}
                                onChange={e => setDraft(prev => ({ ...prev, name: e.target.value }))}
                                className="h-10 w-[280px] rounded-full border-border/70 text-center text-sm"
                            />
                        </div>

                        {/* 指引 */}
                        <div className="mt-8">
                            <Label className="text-xs font-medium text-muted-foreground">
                                {t('settings.agents.instructions', { defaultValue: '指引' })}
                            </Label>
                            <div className="mt-2 rounded-xl border border-border/70 p-4">
                                {instructionsEditing ? (
                                    <Textarea
                                        autoFocus
                                        value={draft.instructions}
                                        rows={6}
                                        placeholder={t('settings.agents.instructionsPlaceholder', {
                                            defaultValue: '你是一名……回答时请……始终……',
                                        })}
                                        onChange={e => setDraft(prev => ({ ...prev, instructions: e.target.value }))}
                                        className="min-h-[130px] resize-none border-0 bg-transparent p-0 font-mono text-sm shadow-none focus-visible:ring-0"
                                    />
                                ) : (
                                    <div className="flex items-center justify-between gap-4">
                                        <p className="text-xs leading-relaxed text-muted-foreground">
                                            {t('settings.agents.instructionsEmptyHint', {
                                                defaultValue: '写一段指引，用来规定这个 Agent 的行为与风格。',
                                            })}
                                        </p>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="shrink-0 gap-1"
                                            onClick={() => setInstructionsEditing(true)}
                                        >
                                            <Plus className="h-3.5 w-3.5" />
                                            {t('settings.agents.addInstructions', { defaultValue: '添加指引' })}
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* 职业头像宫格 */}
                        <div className="mt-6 grid grid-cols-4 gap-2.5">
                            {AGENT_AVATARS.map(profession => {
                                const active = draft.avatar === profession.id
                                return (
                                    <button
                                        key={profession.id}
                                        type="button"
                                        aria-label={profession.id}
                                        aria-pressed={active}
                                        onClick={() => setDraft(prev => ({ ...prev, avatar: profession.id, emoji: '' }))}
                                        className={cn(
                                            'flex flex-col items-center gap-1.5 rounded-xl border px-2 py-2.5 text-foreground transition-colors',
                                            active
                                                ? 'border-primary bg-primary/5'
                                                : 'border-border/60 hover:bg-muted/60',
                                        )}
                                    >
                                        <AgentAvatar id={profession.id} className="h-14 w-14" />
                                        <span className="w-full truncate text-center text-xs leading-tight text-muted-foreground">
                                            {t('settings.agents.profession.' + profession.id, {
                                                defaultValue: profession.id,
                                            })}
                                        </span>
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    <DialogFooter className="border-t border-border/60 px-6 py-4 sm:px-8">
                        <Button type="button" variant="ghost" onClick={handleReset}>
                            {t('settings.agents.reset', { defaultValue: '重置' })}
                        </Button>
                        <Button type="button" onClick={() => void handleSubmit()} disabled={saving}>
                            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                            {t('settings.agents.done', { defaultValue: '完成' })}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </SettingsPanel>
    )
}
