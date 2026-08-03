import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Bot, ChevronDown, Pencil, Plus, Trash2 } from '@kn/icon'
import {
    Button,
    Checkbox,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    Input,
    Label,
    Switch,
    Textarea,
} from '@kn/ui'
import type { AgentDefinition, AgentDefinitionInput, AgentToolInfo, ModelInfo } from '@kn/common'
import {
    createAgentDefinition,
    deleteAgentDefinition,
    fetchAgentTools,
    fetchModels,
    listAgentDefinitions,
    updateAgentDefinition,
    useTranslation,
} from '@kn/common'

interface AgentManagerDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

const EMPTY_FORM: AgentDefinitionInput = {
    name: '',
    description: '',
    systemPrompt: '',
    modelName: undefined,
    toolIds: [],
    maxIterations: undefined,
    enabled: true,
}

/**
 * Custom agent definition manager: a flat list with inline create/edit form.
 * CRUD goes through /api/v2/agent/definitions; tool multi-select is limited
 * to backend tools (empty selection = all backend tools).
 */
export const AgentManagerDialog: React.FC<AgentManagerDialogProps> = ({ open, onOpenChange }) => {
    const { t } = useTranslation()
    const [agents, setAgents] = useState<AgentDefinition[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    // null = list view; 'new' = create form; number = edit form for that id
    const [editing, setEditing] = useState<'new' | number | null>(null)
    const [form, setForm] = useState<AgentDefinitionInput>(EMPTY_FORM)
    const [saving, setSaving] = useState(false)
    const [models, setModels] = useState<ModelInfo[]>([])
    const [tools, setTools] = useState<AgentToolInfo[]>([])

    const reload = useCallback(() => {
        setLoading(true)
        setError(null)
        listAgentDefinitions()
            .then(setAgents)
            .catch((e) => setError(e?.message || String(e)))
            .finally(() => setLoading(false))
    }, [])

    // Load list + form option sources on open; reset to the list view.
    useEffect(() => {
        if (!open) return
        setEditing(null)
        reload()
        fetchModels().then(setModels).catch(() => setModels([]))
        fetchAgentTools().then(setTools).catch(() => setTools([]))
    }, [open, reload])

    const startCreate = () => {
        setForm(EMPTY_FORM)
        setEditing('new')
        setError(null)
    }

    const startEdit = (agent: AgentDefinition) => {
        setForm({
            name: agent.name,
            description: agent.description || '',
            systemPrompt: agent.systemPrompt,
            modelName: agent.modelName,
            toolIds: agent.toolIds || [],
            maxIterations: agent.maxIterations,
            enabled: agent.enabled !== false,
        })
        setEditing(agent.id)
        setError(null)
    }

    const handleDelete = async (agent: AgentDefinition) => {
        const confirmMsg = t('ai.agent.deleteConfirm', {
            defaultValue: `删除 Agent「${agent.name}」？`,
            name: agent.name,
        })
        if (!window.confirm(confirmMsg)) return
        try {
            await deleteAgentDefinition(agent.id)
            reload()
        } catch (e: any) {
            setError(e?.message || String(e))
        }
    }

    const formValid = form.name.trim().length > 0 && form.systemPrompt.trim().length > 0

    const handleSave = async () => {
        if (!formValid || saving) return
        setSaving(true)
        setError(null)
        const payload: AgentDefinitionInput = {
            ...form,
            name: form.name.trim(),
            systemPrompt: form.systemPrompt.trim(),
            description: form.description?.trim() || undefined,
            toolIds: form.toolIds && form.toolIds.length > 0 ? form.toolIds : undefined,
        }
        try {
            if (editing === 'new') {
                await createAgentDefinition(payload)
            } else if (typeof editing === 'number') {
                await updateAgentDefinition(editing, payload)
            }
            setEditing(null)
            reload()
        } catch (e: any) {
            setError(e?.message || String(e))
        } finally {
            setSaving(false)
        }
    }

    const toggleTool = (toolId: string) => {
        setForm((prev) => {
            const current = prev.toolIds || []
            return {
                ...prev,
                toolIds: current.includes(toolId)
                    ? current.filter((id) => id !== toolId)
                    : [...current, toolId],
            }
        })
    }

    const modelLabel = useMemo(() => {
        if (!form.modelName) return t('ai.agent.modelDefault', { defaultValue: '跟随会话模型' })
        const found = models.find((m) => m.id === form.modelName)
        return found?.name || form.modelName
    }, [form.modelName, models, t])

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex max-h-[85vh] max-w-[480px] flex-col p-0 gap-0">
                <DialogHeader className="shrink-0 px-4 pt-3.5 pb-2.5 border-b">
                    <DialogTitle className="flex items-center gap-1.5 text-sm">
                        <Bot className="h-4 w-4" />
                        {t('ai.agent.managerTitle', { defaultValue: 'Agent 管理' })}
                    </DialogTitle>
                    <DialogDescription className="text-[11px]">
                        {t('ai.agent.managerDesc', {
                            defaultValue: '自定义 Agent 可在聊天中选用，或被 delegate_task 按名称委派。',
                        })}
                    </DialogDescription>
                </DialogHeader>

                {error && (
                    <div className="mx-4 mt-2 shrink-0 rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-[11px] text-destructive">
                        {error}
                    </div>
                )}

                {editing === null ? (
                    // ── List view ──
                    <div className="flex min-h-0 flex-1 flex-col p-3">
                        {/* Native overflow instead of Radix ScrollArea: its viewport wraps
                            children in a `display: table` div that sizes to content, which
                            breaks `truncate` and pushes long text past the dialog width. */}
                        <div className="min-h-0 flex-1 overflow-y-auto">
                            {loading && agents.length === 0 && (
                                <div className="py-6 text-center text-[11px] text-muted-foreground">
                                    {t('ai.agent.loading', { defaultValue: '加载中…' })}
                                </div>
                            )}
                            {!loading && agents.length === 0 && (
                                <div className="py-6 text-center text-[11px] text-muted-foreground">
                                    {t('ai.agent.empty', { defaultValue: '还没有自定义 Agent，点击下方按钮创建。' })}
                                </div>
                            )}
                            <div className="space-y-1">
                                {agents.map((agent) => (
                                    <div
                                        key={agent.id}
                                        className="group flex items-center gap-2 rounded-md border border-border/50 px-2.5 py-1.5"
                                    >
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-1.5">
                                                <span className="truncate text-[12px] font-medium">{agent.name}</span>
                                                {agent.enabled === false && (
                                                    <span className="shrink-0 rounded bg-muted px-1 text-[9px] text-muted-foreground">
                                                        {t('ai.agent.disabled', { defaultValue: '已停用' })}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="truncate text-[10px] text-muted-foreground">
                                                {agent.description ||
                                                    t('ai.agent.noDescription', { defaultValue: '无描述' })}
                                            </div>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                                            onClick={() => startEdit(agent)}
                                            aria-label={t('ai.agent.edit', { defaultValue: '编辑' })}
                                        >
                                            <Pencil className="h-3 w-3" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                                            onClick={() => handleDelete(agent)}
                                            aria-label={t('ai.agent.delete', { defaultValue: '删除' })}
                                        >
                                            <Trash2 className="h-3 w-3" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <Button
                            size="sm"
                            variant="outline"
                            className="mt-2.5 h-7 w-full shrink-0 gap-1 text-[11px]"
                            onClick={startCreate}
                        >
                            <Plus className="h-3 w-3" />
                            {t('ai.agent.create', { defaultValue: '新建 Agent' })}
                        </Button>
                    </div>
                ) : (
                    // ── Create / edit form: scrollable body + pinned action bar ──
                    <>
                        <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3.5">
                            <div className="space-y-1">
                                <Label className="text-[11px]">
                                    {t('ai.agent.name', { defaultValue: '名称' })} *
                                </Label>
                                <Input
                                    value={form.name}
                                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                                    placeholder={t('ai.agent.namePlaceholder', { defaultValue: '如：代码审查助手' })}
                                    className="h-7 text-[12px]"
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-[11px]">
                                    {t('ai.agent.description', { defaultValue: '描述' })}
                                </Label>
                                <Input
                                    value={form.description || ''}
                                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                                    placeholder={t('ai.agent.descriptionPlaceholder', {
                                        defaultValue: '供选择器与委派工具展示的简短说明',
                                    })}
                                    className="h-7 text-[12px]"
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-[11px]">
                                    {t('ai.agent.systemPrompt', { defaultValue: '系统提示词' })} *
                                </Label>
                                <Textarea
                                    value={form.systemPrompt}
                                    onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
                                    placeholder={t('ai.agent.systemPromptPlaceholder', {
                                        defaultValue: '定义该 Agent 的角色、能力边界与输出要求…',
                                    })}
                                    rows={5}
                                    className="resize-y text-[12px]"
                                />
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="flex-1 space-y-1">
                                    <Label className="text-[11px]">
                                        {t('ai.agent.model', { defaultValue: '模型' })}
                                    </Label>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <button
                                                type="button"
                                                className="flex h-7 w-full items-center justify-between rounded-md border border-input bg-background px-2 text-[12px]"
                                            >
                                                <span className="truncate">{modelLabel}</span>
                                                <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                                            </button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="start" className="max-h-[220px] w-[220px] overflow-y-auto">
                                            <DropdownMenuItem
                                                className="text-xs"
                                                onClick={() => setForm({ ...form, modelName: undefined })}
                                            >
                                                {t('ai.agent.modelDefault', { defaultValue: '跟随会话模型' })}
                                            </DropdownMenuItem>
                                            {models.map((m) => (
                                                <DropdownMenuItem
                                                    key={m.id}
                                                    className="text-xs"
                                                    onClick={() => setForm({ ...form, modelName: m.id })}
                                                >
                                                    {m.name || m.id}
                                                </DropdownMenuItem>
                                            ))}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                                <div className="w-[110px] space-y-1">
                                    <Label className="text-[11px]">
                                        {t('ai.agent.maxIterations', { defaultValue: '最大迭代数' })}
                                    </Label>
                                    <Input
                                        type="number"
                                        min={1}
                                        value={form.maxIterations ?? ''}
                                        onChange={(e) =>
                                            setForm({
                                                ...form,
                                                maxIterations: e.target.value ? Number(e.target.value) : undefined,
                                            })
                                        }
                                        placeholder={t('ai.agent.maxIterationsPlaceholder', { defaultValue: '默认' })}
                                        className="h-7 text-[12px]"
                                    />
                                </div>
                            </div>
                            <div className="space-y-1">
                                <Label className="text-[11px]">
                                    {t('ai.agent.tools', { defaultValue: '工具（不选 = 全部后端工具）' })}
                                </Label>
                                <div className="max-h-[140px] space-y-0.5 overflow-y-auto rounded-md border border-border/50 p-1.5">
                                    {tools.length === 0 && (
                                        <div className="px-1 py-1.5 text-[10px] text-muted-foreground">
                                            {t('ai.agent.loadingTools', { defaultValue: '加载工具列表中…' })}
                                        </div>
                                    )}
                                    {tools.map((tool) => (
                                        <label
                                            key={tool.id}
                                            className="flex cursor-pointer items-start gap-1.5 rounded px-1 py-0.5 hover:bg-muted/50"
                                        >
                                            <Checkbox
                                                checked={(form.toolIds || []).includes(tool.id)}
                                                onCheckedChange={() => toggleTool(tool.id)}
                                                className="mt-0.5 h-3 w-3"
                                            />
                                            <span className="min-w-0 flex-1">
                                                <span className="block text-[11px] font-medium leading-4">{tool.id}</span>
                                                {tool.description && (
                                                    <span className="block truncate text-[10px] text-muted-foreground">
                                                        {tool.description}
                                                    </span>
                                                )}
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="flex shrink-0 items-center justify-between border-t px-3.5 py-2.5">
                            <label className="flex items-center gap-1.5 text-[11px]">
                                <Switch
                                    checked={form.enabled !== false}
                                    onCheckedChange={(checked) => setForm({ ...form, enabled: checked })}
                                    className="scale-75"
                                />
                                {t('ai.agent.enabled', { defaultValue: '启用' })}
                            </label>
                            <div className="flex items-center gap-1.5">
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 px-2.5 text-[11px]"
                                    onClick={() => setEditing(null)}
                                    disabled={saving}
                                >
                                    {t('ai.agent.cancel', { defaultValue: '取消' })}
                                </Button>
                                <Button
                                    size="sm"
                                    className="h-7 px-3 text-[11px]"
                                    onClick={handleSave}
                                    disabled={!formValid || saving}
                                >
                                    {saving
                                        ? t('ai.agent.saving', { defaultValue: '保存中…' })
                                        : t('ai.agent.save', { defaultValue: '保存' })}
                                </Button>
                            </div>
                        </div>
                    </>
                )}
            </DialogContent>
        </Dialog>
    )
}
