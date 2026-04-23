/**
 * Skill Detail Dialog
 *
 * Shows detailed information about a skill
 */

import React from 'react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Button,
    Badge,
    ScrollArea,
    Separator,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger
} from '@kn/ui'
import {
    Download,
    Star,
    Check,
    Trash2,
    Copy,
    Zap,
    Shield,
    Clock,
    User,
    Link,
    FileCode
} from '@kn/icon'
import type { InstalledSkill, SerializableSkill } from '@kn/common'

export interface SkillDetailDialogProps {
    skill: InstalledSkill | SerializableSkill | null
    open: boolean
    onOpenChange: (open: boolean) => void
    isInstalled?: boolean
    onInstall?: () => void
    onUninstall?: () => void
    onExport?: () => void
    loading?: boolean
}

export const SkillDetailDialog: React.FC<SkillDetailDialogProps> = ({
    skill,
    open,
    onOpenChange,
    isInstalled = false,
    onInstall,
    onUninstall,
    onExport,
    loading = false
}) => {
    if (!skill) return null

    const isInstalledSkill = 'installedAt' in skill
    const installedSkill = skill as InstalledSkill

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[80vh]">
                <DialogHeader>
                    <div className="flex items-start justify-between">
                        <div>
                            <DialogTitle className="flex items-center gap-2">
                                {skill.displayName || skill.name}
                                {(skill as any).verified && (
                                    <Shield className="h-4 w-4 text-blue-500" />
                                )}
                            </DialogTitle>
                            <DialogDescription className="mt-1">
                                {skill.author && (
                                    <span className="flex items-center gap-1">
                                        <User className="h-3 w-3" />
                                        {skill.author}
                                    </span>
                                )}
                            </DialogDescription>
                        </div>
                        <Badge variant="outline">v{skill.version}</Badge>
                    </div>
                </DialogHeader>

                <Tabs defaultValue="overview" className="mt-4">
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="overview">概览</TabsTrigger>
                        <TabsTrigger value="tools">所需工具</TabsTrigger>
                        <TabsTrigger value="prompt">专用指令</TabsTrigger>
                    </TabsList>

                    <ScrollArea className="h-[300px] mt-4">
                        <TabsContent value="overview" className="mt-0 space-y-4">
                            {/* Description */}
                            <div>
                                <h4 className="text-sm font-medium mb-2">描述</h4>
                                <p className="text-sm text-muted-foreground">
                                    {skill.description}
                                </p>
                            </div>

                            {/* Tags */}
                            {skill.tags && skill.tags.length > 0 && (
                                <div>
                                    <h4 className="text-sm font-medium mb-2">标签</h4>
                                    <div className="flex flex-wrap gap-1">
                                        {skill.tags.map(tag => (
                                            <Badge key={tag} variant="secondary">
                                                {tag}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Metadata */}
                            <div>
                                <h4 className="text-sm font-medium mb-2">信息</h4>
                                <div className="grid grid-cols-2 gap-2 text-sm">
                                    <div className="flex items-center gap-2 text-muted-foreground">
                                        <FileCode className="h-4 w-4" />
                                        <span>ID: {skill.id}</span>
                                    </div>
                                    {skill.homepage && (
                                        <div className="flex items-center gap-2 text-muted-foreground">
                                            <Link className="h-4 w-4" />
                                            <a
                                                href={skill.homepage}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="hover:underline"
                                            >
                                                文档
                                            </a>
                                        </div>
                                    )}
                                    {isInstalledSkill && (
                                        <div className="flex items-center gap-2 text-muted-foreground">
                                            <Clock className="h-4 w-4" />
                                            <span>
                                                安装于 {new Date(installedSkill.installedAt).toLocaleDateString()}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </TabsContent>

                        <TabsContent value="tools" className="mt-0 space-y-4">
                            {/* Required Tools */}
                            <div>
                                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                                    <Zap className="h-4 w-4 text-yellow-500" />
                                    必需工具 ({skill.requiredTools.length})
                                </h4>
                                <div className="space-y-1">
                                    {skill.requiredTools.map(tool => (
                                        <div
                                            key={tool}
                                            className="flex items-center justify-between p-2 rounded-md bg-muted/50"
                                        >
                                            <code className="text-sm">{tool}</code>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => copyToClipboard(tool)}
                                            >
                                                <Copy className="h-3 w-3" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Optional Tools */}
                            {skill.optionalTools && skill.optionalTools.length > 0 && (
                                <div>
                                    <h4 className="text-sm font-medium mb-2 text-muted-foreground">
                                        可选工具 ({skill.optionalTools.length})
                                    </h4>
                                    <div className="space-y-1">
                                        {skill.optionalTools.map(tool => (
                                            <div
                                                key={tool}
                                                className="flex items-center justify-between p-2 rounded-md bg-muted/30"
                                            >
                                                <code className="text-sm text-muted-foreground">{tool}</code>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => copyToClipboard(tool)}
                                                >
                                                    <Copy className="h-3 w-3" />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </TabsContent>

                        <TabsContent value="prompt" className="mt-0">
                            {skill.systemPromptFragment ? (
                                <div className="relative">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="absolute top-2 right-2"
                                        onClick={() => copyToClipboard(skill.systemPromptFragment!)}
                                    >
                                        <Copy className="h-4 w-4" />
                                    </Button>
                                    <pre className="p-4 rounded-md bg-muted text-sm overflow-x-auto whitespace-pre-wrap">
                                        {skill.systemPromptFragment}
                                    </pre>
                                </div>
                            ) : (
                                <p className="text-sm text-muted-foreground text-center py-8">
                                    此技能没有专用指令
                                </p>
                            )}
                        </TabsContent>
                    </ScrollArea>
                </Tabs>

                <Separator className="my-4" />

                <DialogFooter className="flex items-center justify-between sm:justify-between">
                    <div>
                        {onExport && isInstalled && (
                            <Button variant="outline" onClick={onExport}>
                                <Copy className="h-4 w-4 mr-2" />
                                导出 JSON
                            </Button>
                        )}
                    </div>
                    <div className="flex gap-2">
                        {isInstalled ? (
                            <>
                                {onUninstall && (
                                    <Button
                                        variant="destructive"
                                        onClick={onUninstall}
                                        disabled={loading}
                                    >
                                        <Trash2 className="h-4 w-4 mr-2" />
                                        卸载
                                    </Button>
                                )}
                            </>
                        ) : (
                            onInstall && (
                                <Button onClick={onInstall} disabled={loading}>
                                    <Download className="h-4 w-4 mr-2" />
                                    安装
                                </Button>
                            )
                        )}
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
