/**
 * Create/Import Skill Dialog
 *
 * Dialog for creating custom skills or importing from JSON/URL
 */

import React, { useState } from 'react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Button,
    Input,
    Textarea,
    Label,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
    Badge,
    toast
} from '@kn/ui'
import { Plus, Upload, Link, X } from '@kn/icon'
import type { SerializableSkill } from '../../ai/skills/skill-registry'

export interface CreateSkillDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onCreateSkill: (skill: SerializableSkill) => Promise<{ success: boolean; message: string }>
    onImportFromJson: (json: string) => Promise<{ success: boolean; message: string }>
    onImportFromUrl: (url: string) => Promise<{ success: boolean; message: string }>
}

export const CreateSkillDialog: React.FC<CreateSkillDialogProps> = ({
    open,
    onOpenChange,
    onCreateSkill,
    onImportFromJson,
    onImportFromUrl
}) => {
    const [activeTab, setActiveTab] = useState('create')
    const [loading, setLoading] = useState(false)

    // Create form state
    const [name, setName] = useState('')
    const [displayName, setDisplayName] = useState('')
    const [description, setDescription] = useState('')
    const [requiredTools, setRequiredTools] = useState<string[]>([])
    const [toolInput, setToolInput] = useState('')
    const [tags, setTags] = useState<string[]>([])
    const [tagInput, setTagInput] = useState('')
    const [systemPrompt, setSystemPrompt] = useState('')

    // Import state
    const [jsonInput, setJsonInput] = useState('')
    const [urlInput, setUrlInput] = useState('')

    const resetForm = () => {
        setName('')
        setDisplayName('')
        setDescription('')
        setRequiredTools([])
        setToolInput('')
        setTags([])
        setTagInput('')
        setSystemPrompt('')
        setJsonInput('')
        setUrlInput('')
    }

    const handleClose = () => {
        resetForm()
        onOpenChange(false)
    }

    const addTool = () => {
        if (toolInput.trim() && !requiredTools.includes(toolInput.trim())) {
            setRequiredTools([...requiredTools, toolInput.trim()])
            setToolInput('')
        }
    }

    const removeTool = (tool: string) => {
        setRequiredTools(requiredTools.filter(t => t !== tool))
    }

    const addTag = () => {
        if (tagInput.trim() && !tags.includes(tagInput.trim())) {
            setTags([...tags, tagInput.trim()])
            setTagInput('')
        }
    }

    const removeTag = (tag: string) => {
        setTags(tags.filter(t => t !== tag))
    }

    const handleCreate = async () => {
        if (!name.trim() || !displayName.trim() || !description.trim()) {
            toast.error('请填写必填字段')
            return
        }

        if (requiredTools.length === 0) {
            toast.error('请至少添加一个必需工具')
            return
        }

        setLoading(true)
        try {
            const skill: SerializableSkill = {
                id: `custom-${name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
                name: name.toLowerCase().replace(/\s+/g, '-'),
                displayName,
                description,
                version: '1.0.0',
                requiredTools,
                tags: tags.length > 0 ? tags : undefined,
                systemPromptFragment: systemPrompt.trim() || undefined,
                createdAt: new Date().toISOString()
            }

            const result = await onCreateSkill(skill)
            if (result.success) {
                toast.success('技能创建成功')
                handleClose()
            } else {
                toast.error(result.message)
            }
        } finally {
            setLoading(false)
        }
    }

    const handleImportJson = async () => {
        if (!jsonInput.trim()) {
            toast.error('请输入 JSON')
            return
        }

        setLoading(true)
        try {
            const result = await onImportFromJson(jsonInput)
            if (result.success) {
                toast.success('技能导入成功')
                handleClose()
            } else {
                toast.error(result.message)
            }
        } finally {
            setLoading(false)
        }
    }

    const handleImportUrl = async () => {
        if (!urlInput.trim()) {
            toast.error('请输入 URL')
            return
        }

        setLoading(true)
        try {
            const result = await onImportFromUrl(urlInput)
            if (result.success) {
                toast.success('技能导入成功')
                handleClose()
            } else {
                toast.error(result.message)
            }
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>添加技能</DialogTitle>
                    <DialogDescription>
                        创建自定义技能或从外部导入
                    </DialogDescription>
                </DialogHeader>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="create">
                            <Plus className="h-4 w-4 mr-2" />
                            创建
                        </TabsTrigger>
                        <TabsTrigger value="json">
                            <Upload className="h-4 w-4 mr-2" />
                            JSON
                        </TabsTrigger>
                        <TabsTrigger value="url">
                            <Link className="h-4 w-4 mr-2" />
                            URL
                        </TabsTrigger>
                    </TabsList>

                    {/* Create Tab */}
                    <TabsContent value="create" className="space-y-4 mt-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="name">技能名称 (英文) *</Label>
                                <Input
                                    id="name"
                                    placeholder="my-skill"
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="displayName">显示名称 *</Label>
                                <Input
                                    id="displayName"
                                    placeholder="我的技能"
                                    value={displayName}
                                    onChange={e => setDisplayName(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="description">描述 *</Label>
                            <Textarea
                                id="description"
                                placeholder="描述这个技能的功能..."
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                rows={2}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>必需工具 *</Label>
                            <div className="flex gap-2">
                                <Input
                                    placeholder="输入工具名称，如 readChunk"
                                    value={toolInput}
                                    onChange={e => setToolInput(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTool())}
                                />
                                <Button type="button" variant="secondary" onClick={addTool}>
                                    添加
                                </Button>
                            </div>
                            {requiredTools.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                    {requiredTools.map(tool => (
                                        <Badge key={tool} variant="secondary" className="gap-1">
                                            {tool}
                                            <X
                                                className="h-3 w-3 cursor-pointer"
                                                onClick={() => removeTool(tool)}
                                            />
                                        </Badge>
                                    ))}
                                </div>
                            )}
                            <p className="text-xs text-muted-foreground">
                                常用工具: getDocumentStructure, readChunk, searchInDocument, replaceContent, insertNear, askUserChoice
                            </p>
                        </div>

                        <div className="space-y-2">
                            <Label>标签</Label>
                            <div className="flex gap-2">
                                <Input
                                    placeholder="输入标签"
                                    value={tagInput}
                                    onChange={e => setTagInput(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag())}
                                />
                                <Button type="button" variant="secondary" onClick={addTag}>
                                    添加
                                </Button>
                            </div>
                            {tags.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                    {tags.map(tag => (
                                        <Badge key={tag} variant="outline" className="gap-1">
                                            {tag}
                                            <X
                                                className="h-3 w-3 cursor-pointer"
                                                onClick={() => removeTag(tag)}
                                            />
                                        </Badge>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="systemPrompt">专用 System Prompt</Label>
                            <Textarea
                                id="systemPrompt"
                                placeholder="## 技能激活后的专用指令&#10;&#10;当此技能激活时，你应该..."
                                value={systemPrompt}
                                onChange={e => setSystemPrompt(e.target.value)}
                                rows={6}
                                className="font-mono text-sm"
                            />
                            <p className="text-xs text-muted-foreground">
                                激活技能时会添加到 Agent 的系统提示中
                            </p>
                        </div>
                    </TabsContent>

                    {/* JSON Import Tab */}
                    <TabsContent value="json" className="space-y-4 mt-4">
                        <div className="space-y-2">
                            <Label htmlFor="jsonInput">粘贴技能 JSON</Label>
                            <Textarea
                                id="jsonInput"
                                placeholder={`{
  "id": "my-skill",
  "name": "my-skill",
  "displayName": "我的技能",
  "description": "技能描述",
  "version": "1.0.0",
  "requiredTools": ["tool1", "tool2"],
  "systemPromptFragment": "专用指令..."
}`}
                                value={jsonInput}
                                onChange={e => setJsonInput(e.target.value)}
                                rows={12}
                                className="font-mono text-sm"
                            />
                        </div>
                    </TabsContent>

                    {/* URL Import Tab */}
                    <TabsContent value="url" className="space-y-4 mt-4">
                        <div className="space-y-2">
                            <Label htmlFor="urlInput">技能 JSON URL</Label>
                            <Input
                                id="urlInput"
                                placeholder="https://example.com/skills/my-skill.json"
                                value={urlInput}
                                onChange={e => setUrlInput(e.target.value)}
                            />
                            <p className="text-xs text-muted-foreground">
                                URL 应返回有效的技能 JSON 定义
                            </p>
                        </div>

                        <div className="p-4 rounded-lg bg-muted/50">
                            <h4 className="text-sm font-medium mb-2">示例技能 URL</h4>
                            <div className="space-y-1 text-xs text-muted-foreground">
                                <p>• GitHub Gist: https://gist.githubusercontent.com/...</p>
                                <p>• GitHub Raw: https://raw.githubusercontent.com/...</p>
                                <p>• 自托管: https://your-domain.com/skills/skill.json</p>
                            </div>
                        </div>
                    </TabsContent>
                </Tabs>

                <DialogFooter className="mt-6">
                    <Button variant="outline" onClick={handleClose}>
                        取消
                    </Button>
                    {activeTab === 'create' && (
                        <Button onClick={handleCreate} disabled={loading}>
                            {loading ? '创建中...' : '创建技能'}
                        </Button>
                    )}
                    {activeTab === 'json' && (
                        <Button onClick={handleImportJson} disabled={loading}>
                            {loading ? '导入中...' : '导入 JSON'}
                        </Button>
                    )}
                    {activeTab === 'url' && (
                        <Button onClick={handleImportUrl} disabled={loading}>
                            {loading ? '导入中...' : '从 URL 导入'}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
