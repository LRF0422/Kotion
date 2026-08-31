import React, { useCallback, useEffect, useState } from "react"
import {
    Button, Card, CardContent, Skeleton, cn, toast,
    Dialog, DialogContent, DialogHeader, DialogTitle,
    Badge, ScrollArea
} from "@kn/ui"
import {
    FileText, Plus, LayoutTemplate, Trash2, Copy, Eye
} from "@kn/icon"
import {
    type SpacePageTemplate,
    useNavigator,
    useSafeState,
    useSpacePageService,
    useTranslation,
} from "@kn/common"
import { PageIconData, PageItemIcon } from "../components/PageItemIcon"
import { TemplatePreview } from "../../../components/TemplatePreview"

interface SpaceTemplateLibraryProps {
    spaceId: string
    onUseTemplate?: (templateId: string) => void
    className?: string
}

const getTemplateIcon = (template: SpacePageTemplate): PageIconData | null => {
    const icon = template.metadata?.icon
    if (!icon || typeof icon !== "object" || Array.isArray(icon)) return null
    const value = icon as Partial<PageIconData>
    return typeof value.icon === "string" ? value as PageIconData : null
}

export const SpaceTemplateLibrary: React.FC<SpaceTemplateLibraryProps> = ({
    spaceId,
    onUseTemplate,
    className
}) => {
    const { t } = useTranslation()
    const service = useSpacePageService()
    const navigator = useNavigator()
    const [templates, setTemplates] = useSafeState<SpacePageTemplate[]>([])
    const [loading, setLoading] = useSafeState(true)

    const fetchTemplates = useCallback(() => {
        setLoading(true)
        service.templates.getSpaceTemplates(spaceId)
            .then(setTemplates)
            .catch(() => setTemplates([]))
            .finally(() => setLoading(false))
    }, [service, spaceId])

    useEffect(() => {
        fetchTemplates()
    }, [fetchTemplates])

    const handleUseTemplate = useCallback((templateId: string) => {
        if (onUseTemplate) {
            onUseTemplate(templateId)
        } else {
            // Default: create page from template
            service.pages.createPage({
                spaceId,
                parentId: "0",
                templateId,
                title: "Untitled"
            }).then(page => {
                navigator.go({ to: `/space-detail/${spaceId}/page/edit/${page.id}` })
            }).catch(() => {
                toast.error(t('template.useError', 'Failed to create page from template'))
            })
        }
    }, [service, spaceId, onUseTemplate, navigator, t])

    const [previewTemplate, setPreviewTemplate] = useState<SpacePageTemplate | null>(null)

    const handleDeleteTemplate = useCallback(async (templateId: string) => {
        try {
            await service.templates.deleteTemplate(templateId)
            toast.success(t('template.deleted', 'Template deleted'))
            fetchTemplates()
        } catch {
            toast.error(t('template.deleteError', 'Failed to delete template'))
        }
    }, [service, fetchTemplates, t])

    if (loading) {
        return (
            <div className={cn("grid grid-cols-1 sm:grid-cols-2 gap-3 p-4", className)}>
                {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-28 rounded-xl" />
                ))}
            </div>
        )
    }

    if (templates.length === 0) {
        return (
            <div className={cn("flex flex-col items-center justify-center py-12 text-center", className)}>
                <LayoutTemplate className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <h3 className="text-sm font-medium mb-1">
                    {t('template.emptyTitle', 'No team templates yet')}
                </h3>
                <p className="text-xs text-muted-foreground max-w-xs">
                    {t('template.emptyDesc', 'Save any page as a template to share it with your team. Team members can use templates to create new pages quickly.')}
                </p>
            </div>
        )
    }

    return (
        <>
            <div className={cn("space-y-4", className)}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {templates.map((template) => (
                        <Card
                            key={template.id}
                            className="group relative hover:shadow-md transition-shadow cursor-pointer"
                        >
                            <CardContent className="p-4">
                                <div className="flex items-start gap-3">
                                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                                        {getTemplateIcon(template)?.icon ? <PageItemIcon icon={getTemplateIcon(template)} size={16} /> : <LayoutTemplate className="h-4 w-4 text-primary" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h4 className="text-sm font-medium truncate">
                                            {template.title || t('template.untitled', 'Untitled Template')}
                                        </h4>
                                        {template.description && (
                                            <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                                                {template.description}
                                            </p>
                                        )}
                                        {template.tags && template.tags.length > 0 && (
                                            <div className="flex flex-wrap gap-1 mt-2">
                                                {template.tags.slice(0, 3).map(tag => (
                                                    <Badge key={tag} variant="secondary" className="text-[10px] h-4 px-1.5">
                                                        {tag}
                                                    </Badge>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                {/* Action buttons */}
                                <div className="flex items-center gap-1.5 mt-3 pt-2 border-t">
                                    <Button
                                        variant="default"
                                        size="sm"
                                        className="h-7 text-xs flex-1 gap-1"
                                        onClick={() => handleUseTemplate(template.id)}
                                    >
                                        <Copy className="h-3 w-3" />
                                        {t('template.use', 'Use Template')}
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-7 w-7 p-0"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            setPreviewTemplate(template)
                                        }}
                                        title={t('template.preview', 'Preview')}
                                    >
                                        <Eye className="h-3 w-3" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            handleDeleteTemplate(template.id)
                                        }}
                                    >
                                        <Trash2 className="h-3 w-3" />
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>

            {/* Preview Dialog */}
            <Dialog open={!!previewTemplate} onOpenChange={(open) => { if (!open) setPreviewTemplate(null) }}>
                <DialogContent className="max-w-3xl h-[80vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            {previewTemplate && getTemplateIcon(previewTemplate)?.icon
                                ? <PageItemIcon icon={getTemplateIcon(previewTemplate)} size={18} />
                                : <LayoutTemplate className="h-4 w-4 text-primary" />}
                            {previewTemplate?.title || t('template.untitled', 'Untitled Template')}
                        </DialogTitle>
                    </DialogHeader>
                    {previewTemplate?.description && (
                        <p className="text-xs text-muted-foreground -mt-2">{previewTemplate.description}</p>
                    )}
                    <ScrollArea className="flex-1 min-h-0 rounded-lg border bg-background">
                        {previewTemplate && (
                            <TemplatePreview templateId={previewTemplate.id} className="min-h-full" />
                        )}
                    </ScrollArea>
                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="outline" size="sm" onClick={() => setPreviewTemplate(null)}>
                            {t('template.cancel', 'Cancel')}
                        </Button>
                        <Button size="sm" className="gap-1" onClick={() => {
                            if (previewTemplate) {
                                handleUseTemplate(previewTemplate.id)
                                setPreviewTemplate(null)
                            }
                        }}>
                            <Copy className="h-3.5 w-3.5" />
                            {t('template.use', 'Use Template')}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    )
}
