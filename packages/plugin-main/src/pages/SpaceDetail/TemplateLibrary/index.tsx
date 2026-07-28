import React, { useCallback, useEffect } from "react"
import {
    Button, Card, CardContent, Skeleton, cn, toast,
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
    Badge
} from "@kn/ui"
import {
    FileText, Plus, LayoutTemplate, Trash2, Copy
} from "@kn/icon"
import { useApi, useNavigator, useTranslation, useSafeState } from "@kn/common"
import { APIS } from "../../../api"
import { PageItemIcon } from "../components/PageItemIcon"

interface SpaceTemplateLibraryProps {
    spaceId: string
    onUseTemplate?: (templateId: string) => void
    className?: string
}

interface TemplateItem {
    id: string
    title: string
    description?: string
    icon?: { icon?: string }
    cover?: string
    updateTime?: string
    tags?: string[]
}

export const SpaceTemplateLibrary: React.FC<SpaceTemplateLibraryProps> = ({
    spaceId,
    onUseTemplate,
    className
}) => {
    const { t } = useTranslation()
    const navigator = useNavigator()
    const [templates, setTemplates] = useSafeState<TemplateItem[]>([])
    const [loading, setLoading] = useSafeState(true)

    const fetchTemplates = useCallback(() => {
        setLoading(true)
        useApi(APIS.GET_SPACE_TEMPLATES, { spaceId })
            .then(res => setTemplates(res.data || []))
            .catch(() => setTemplates([]))
            .finally(() => setLoading(false))
    }, [spaceId])

    useEffect(() => {
        fetchTemplates()
    }, [spaceId])

    const handleUseTemplate = useCallback((templateId: string) => {
        if (onUseTemplate) {
            onUseTemplate(templateId)
        } else {
            // Default: create page from template
            useApi(APIS.CREATE_OR_SAVE_PAGE, null, {
                spaceId,
                parentId: "0",
                templateId,
                title: "Untitled"
            }).then(res => {
                const page = res.data
                if (page?.id) {
                    navigator.go({ to: `/space-detail/${spaceId}/page/edit/${page.id}` })
                }
            }).catch(() => {
                toast.error(t('template.useError', 'Failed to create page from template'))
            })
        }
    }, [spaceId, onUseTemplate, navigator])

    const handleDeleteTemplate = useCallback(async (templateId: string) => {
        try {
            await useApi(APIS.DELETE_TEMPLATE, { id: templateId })
            toast.success(t('template.deleted', 'Template deleted'))
            fetchTemplates()
        } catch {
            toast.error(t('template.deleteError', 'Failed to delete template'))
        }
    }, [])

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
                                    {template.icon?.icon ? <PageItemIcon icon={template.icon as any} size={16} /> : <LayoutTemplate className="h-4 w-4 text-primary" />}
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
    )
}
