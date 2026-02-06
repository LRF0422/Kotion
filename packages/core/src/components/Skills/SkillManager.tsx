/**
 * Skill Manager Panel
 *
 * Main UI for managing skills - browse marketplace, view installed, create custom
 */

import React, { useState, useMemo } from 'react'
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
    Button,
    Input,
    Badge,
    ScrollArea,
    Skeleton,
    cn,
    toast,
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle
} from '@kn/ui'
import {
    Search,
    Plus,
    Package,
    Store,
    Zap,
    RefreshCw,
    BookOpen
} from '@kn/icon'
import { SkillCard } from './SkillCard'
import { SkillDetailDialog } from './SkillDetailDialog'
import { CreateSkillDialog } from './CreateSkillDialog'
import { SkillsMPMarketplace } from './SkillsMPMarketplace'
import { useSkillRegistry } from '../../ai/skills/use-skill-registry'
import { exampleSkills } from '../../ai/skills/examples'
import type { InstalledSkill, SerializableSkill } from '../../ai/skills/skill-registry'

export interface SkillManagerProps {
    className?: string
}

export const SkillManager: React.FC<SkillManagerProps> = ({ className }) => {
    const {
        skills: installedSkills,
        loading,
        install,
        installFromJson,
        installFromUrl,
        uninstall,
        setEnabled,
        refresh,
        exportToJson,
        registry
    } = useSkillRegistry()

    // UI State
    const [activeTab, setActiveTab] = useState('installed')
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedSkill, setSelectedSkill] = useState<InstalledSkill | SerializableSkill | null>(null)
    const [detailOpen, setDetailOpen] = useState(false)
    const [createOpen, setCreateOpen] = useState(false)
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
    const [skillToDelete, setSkillToDelete] = useState<string | null>(null)
    const [actionLoading, setActionLoading] = useState(false)

    // Filter installed skills
    const filteredInstalled = useMemo(() => {
        if (!searchQuery) return installedSkills
        const query = searchQuery.toLowerCase()
        return installedSkills.filter(skill =>
            skill.name.toLowerCase().includes(query) ||
            skill.displayName.toLowerCase().includes(query) ||
            skill.description.toLowerCase().includes(query) ||
            skill.tags?.some(tag => tag.toLowerCase().includes(query))
        )
    }, [installedSkills, searchQuery])

    // Filter marketplace skills (example skills for now)
    const filteredMarketplace = useMemo(() => {
        if (!searchQuery) return exampleSkills
        const query = searchQuery.toLowerCase()
        return exampleSkills.filter(skill =>
            skill.name.toLowerCase().includes(query) ||
            skill.displayName.toLowerCase().includes(query) ||
            skill.description.toLowerCase().includes(query) ||
            skill.tags?.some(tag => tag.toLowerCase().includes(query))
        )
    }, [searchQuery])

    // Check if a skill is installed
    const isSkillInstalled = (skillId: string) => {
        return installedSkills.some(s => s.id === skillId)
    }

    // Handlers
    const handleInstall = async (skill: SerializableSkill) => {
        setActionLoading(true)
        try {
            const result = await install(skill, 'marketplace')
            if (result.success) {
                toast.success(`技能 "${skill.displayName}" 安装成功`)
            } else {
                toast.error(result.message)
            }
        } finally {
            setActionLoading(false)
        }
    }

    const handleUninstall = async (skillId: string) => {
        setActionLoading(true)
        try {
            const result = await uninstall(skillId)
            if (result.success) {
                toast.success('技能已卸载')
                setDetailOpen(false)
            } else {
                toast.error(result.message)
            }
        } finally {
            setActionLoading(false)
            setDeleteConfirmOpen(false)
            setSkillToDelete(null)
        }
    }

    const handleToggleEnabled = async (skillId: string, enabled: boolean) => {
        const result = await setEnabled(skillId, enabled)
        if (result.success) {
            toast.success(enabled ? '技能已启用' : '技能已禁用')
        } else {
            toast.error(result.message)
        }
    }

    const handleExport = (skillId: string) => {
        const json = exportToJson(skillId)
        if (json) {
            navigator.clipboard.writeText(json)
            toast.success('技能 JSON 已复制到剪贴板')
        }
    }

    const handleCreateSkill = async (skill: SerializableSkill) => {
        return await install(skill, 'custom')
    }

    const confirmDelete = (skillId: string) => {
        setSkillToDelete(skillId)
        setDeleteConfirmOpen(true)
    }

    return (
        <div className={cn("flex flex-col h-full overflow-hidden", className)}>
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b flex-shrink-0">
                <div>
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                        <Zap className="h-5 w-5" />
                        技能管理
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        安装和管理 AI 技能
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={refresh}
                        disabled={loading}
                    >
                        <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                    </Button>
                    <Button onClick={() => setCreateOpen(true)}>
                        <Plus className="h-4 w-4 mr-2" />
                        添加技能
                    </Button>
                </div>
            </div>

            {/* Search */}
            <div className="p-4 border-b flex-shrink-0">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="搜索技能..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="pl-9"
                    />
                </div>
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0 overflow-hidden">
                <div className="px-4 pt-2 flex-shrink-0">
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="installed" className="gap-2">
                            <Package className="h-4 w-4" />
                            已安装
                            <Badge variant="secondary" className="ml-1">
                                {installedSkills.length}
                            </Badge>
                        </TabsTrigger>
                        <TabsTrigger value="marketplace" className="gap-2">
                            <Store className="h-4 w-4" />
                            SkillsMP
                        </TabsTrigger>
                        <TabsTrigger value="examples" className="gap-2">
                            <BookOpen className="h-4 w-4" />
                            示例
                        </TabsTrigger>
                    </TabsList>
                </div>

                <ScrollArea className="flex-1 min-h-0 p-4">
                    {/* Installed Skills */}
                    <TabsContent value="installed" className="mt-0">
                        {loading ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {[1, 2, 3].map(i => (
                                    <Skeleton key={i} className="h-48" />
                                ))}
                            </div>
                        ) : filteredInstalled.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-center">
                                <Package className="h-12 w-12 text-muted-foreground mb-4" />
                                <h3 className="text-lg font-medium">
                                    {searchQuery ? '没有找到匹配的技能' : '还没有安装技能'}
                                </h3>
                                <p className="text-sm text-muted-foreground mt-1">
                                    {searchQuery
                                        ? '尝试其他搜索词'
                                        : '去技能市场看看，或创建自定义技能'}
                                </p>
                                {!searchQuery && (
                                    <div className="flex gap-2 mt-4">
                                        <Button
                                            variant="outline"
                                            onClick={() => setActiveTab('marketplace')}
                                        >
                                            <Store className="h-4 w-4 mr-2" />
                                            浏览市场
                                        </Button>
                                        <Button onClick={() => setCreateOpen(true)}>
                                            <Plus className="h-4 w-4 mr-2" />
                                            创建技能
                                        </Button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {filteredInstalled.map(skill => (
                                    <SkillCard
                                        key={skill.id}
                                        skill={skill}
                                        variant="installed"
                                        onToggleEnabled={enabled => handleToggleEnabled(skill.id, enabled)}
                                        onUninstall={() => confirmDelete(skill.id)}
                                        onViewDetails={() => {
                                            setSelectedSkill(skill)
                                            setDetailOpen(true)
                                        }}
                                        loading={actionLoading}
                                    />
                                ))}
                            </div>
                        )}
                    </TabsContent>

                    {/* SkillsMP Marketplace */}
                    <TabsContent value="marketplace" className="mt-0">
                        <SkillsMPMarketplace
                            apiKey="sk_live_skillsmp_FRFtbtfIbMoCSyxEwJ2J5Ke4I2HxRzKzU8vP-j8Tj54"
                            onInstall={handleInstall}
                            isInstalled={isSkillInstalled}
                            onViewDetails={(skill) => {
                                setSelectedSkill(skill)
                                setDetailOpen(true)
                            }}
                            loading={actionLoading}
                        />
                    </TabsContent>

                    {/* Examples */}
                    <TabsContent value="examples" className="mt-0">
                        <div className="mb-4">
                            <p className="text-sm text-muted-foreground">
                                内置示例技能 - 可直接安装使用
                            </p>
                        </div>
                        {filteredMarketplace.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-center">
                                <BookOpen className="h-12 w-12 text-muted-foreground mb-4" />
                                <h3 className="text-lg font-medium">没有找到匹配的技能</h3>
                                <p className="text-sm text-muted-foreground mt-1">
                                    尝试其他搜索词
                                </p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {filteredMarketplace.map(skill => (
                                    <SkillCard
                                        key={skill.id}
                                        skill={{
                                            ...skill,
                                            downloads: Math.floor(Math.random() * 2000) + 100,
                                            rating: 4 + Math.random(),
                                            verified: skill.author === 'Knowledge Repo',
                                            featured: skill.id === 'translation-assistant'
                                        }}
                                        variant="marketplace"
                                        isInstalled={isSkillInstalled(skill.id)}
                                        onInstall={() => handleInstall(skill)}
                                        onViewDetails={() => {
                                            setSelectedSkill(skill)
                                            setDetailOpen(true)
                                        }}
                                        loading={actionLoading}
                                    />
                                ))}
                            </div>
                        )}
                    </TabsContent>
                </ScrollArea>
            </Tabs>

            {/* Skill Detail Dialog */}
            <SkillDetailDialog
                skill={selectedSkill}
                open={detailOpen}
                onOpenChange={setDetailOpen}
                isInstalled={selectedSkill ? isSkillInstalled(selectedSkill.id) : false}
                onInstall={selectedSkill ? () => handleInstall(selectedSkill as SerializableSkill) : undefined}
                onUninstall={selectedSkill ? () => confirmDelete(selectedSkill.id) : undefined}
                onExport={selectedSkill && isSkillInstalled(selectedSkill.id)
                    ? () => handleExport(selectedSkill.id)
                    : undefined}
                loading={actionLoading}
            />

            {/* Create Skill Dialog */}
            <CreateSkillDialog
                open={createOpen}
                onOpenChange={setCreateOpen}
                onCreateSkill={handleCreateSkill}
                onImportFromJson={installFromJson}
                onImportFromUrl={installFromUrl}
            />

            {/* Delete Confirmation */}
            <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>确认卸载</AlertDialogTitle>
                        <AlertDialogDescription>
                            确定要卸载这个技能吗？此操作无法撤销。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => skillToDelete && handleUninstall(skillToDelete)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            卸载
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
