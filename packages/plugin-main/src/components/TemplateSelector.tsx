import { Button, Card, Input, MultiSelect, Sheet, SheetContent, SheetTitle, toast } from "@kn/ui";
import { format, parseISO, formatDistanceToNow } from "@kn/ui";
import { useApi, useUploadFile, useTranslation } from "@kn/common"
import { ArrowLeft, Clock, Trash2, FileText, Plus } from "@kn/icon";
import React, { useState, useEffect, useCallback } from "react";
import { APIS } from "../api";
import { Template } from "../model/Template";
import { resolveUserBrief } from "../utils/userBrief";
import { TemplatePreview } from "./TemplatePreview";

interface TemplateSelectorProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreateFromTemplate: (templateId: string, title?: string) => void;
    /** When provided, the grid leads with a "start from scratch" tile. */
    onCreateBlank?: () => void;
}

const relativeTime = (value?: string): string => {
    if (!value) return ""
    try {
        return formatDistanceToNow(parseISO(value), { addSuffix: true })
    } catch {
        try {
            return format(parseISO(value), "MM/dd/yyyy")
        } catch {
            return value
        }
    }
}

/**
 * Normalize a raw template record from the backend into the shape the cards
 * render. A template is just a page, so the API returns `PageVO`: the author is
 * a bare `createUser` / `updateUser` id (resolved to a name later) and there is
 * no `category` field — the page's `tags` play that role. `cover` may come back
 * as a single string rather than a list.
 */
const normalizeTemplate = (item: any, untitled: string): Template => {
    const coverRaw = item?.cover;
    const cover = Array.isArray(coverRaw) ? coverRaw : (coverRaw ? [coverRaw] : []);
    const tags: string[] = Array.isArray(item?.tags) ? item.tags.filter(Boolean) : [];
    const authorId = item?.updateUser ?? item?.createUser;
    return {
        ...item,
        id: item?.id,
        title: item?.title ?? item?.name ?? untitled,
        description: item?.description ?? "",
        cover,
        author: item?.author ?? item?.authorName ?? "",
        authorId: authorId ? String(authorId) : undefined,
        tags,
        category: item?.category ?? item?.categories?.[0]?.text ?? tags[0] ?? "",
        categories: item?.categories ?? tags.map((tag: string) => ({ id: tag.toLowerCase(), text: tag })),
        createdAt: item?.createdAt ?? item?.createTime,
        updatedAt: item?.updatedAt ?? item?.updateTime,
    };
};

export const TemplateSelector: React.FC<TemplateSelectorProps> = ({
    open,
    onOpenChange,
    onCreateFromTemplate,
    onCreateBlank
}) => {
    const [allTemplates, setAllTemplates] = useState<Template[]>([]);
    const [filteredTemplates, setFilteredTemplates] = useState<Template[]>([]);
    const [searchValue, setSearchValue] = useState<string>("");
    const [categories, setCategories] = useState<{ id: string; text: string }[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);

    const { usePath } = useUploadFile();
    const { t } = useTranslation();

    // Load templates when the sheet opens; reset preview when it closes
    useEffect(() => {
        if (open) {
            loadTemplates();
        } else {
            setPreviewTemplate(null);
        }
    }, [open]);

    const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

    // Combined filtering effect for both search and categories
    useEffect(() => {
        let result = [...allTemplates];

        // Apply search filter
        if (searchValue.trim() !== "") {
            result = result.filter(template =>
                template.title?.toLowerCase().includes(searchValue.toLowerCase()) ||
                template.description?.toLowerCase().includes(searchValue.toLowerCase())
            );
        }

        // Apply category filter
        if (selectedCategories.length > 0 && !selectedCategories.includes('all')) {
            result = result.filter(template =>
                selectedCategories.some(category =>
                    template.category?.toLowerCase().includes(category.toLowerCase()) ||
                    template.tags?.some(tag => tag.toLowerCase() === category.toLowerCase())
                )
            );
        }

        setFilteredTemplates(result);
    }, [searchValue, allTemplates, selectedCategories]);

    const loadTemplates = async () => {
        setLoading(true);
        try {
            const templateResponse = await useApi(APIS.QUERY_TEMPLATE);
            // Backend may return either a plain array or a paginated { records: [] }
            // object — handle both, mirroring how favorites are read in Home/index.tsx.
            const raw = templateResponse?.data;
            const list = Array.isArray(raw) ? raw : (raw?.records || []);
            const untitled = t('template.untitled');
            const templatesData: Template[] = list.map((item: any) => normalizeTemplate(item, untitled));
            setAllTemplates(templatesData);
            setFilteredTemplates(templatesData);
            // Names arrive after the grid renders — the cards fall back to the
            // placeholder until then, same as the page header does.
            void hydrateAuthors(templatesData);

            // Extract categories dynamically from templates
            const categorySet = new Map<string, string>();
            templatesData.forEach(tpl => {
                if (tpl.category) {
                    categorySet.set(tpl.category.toLowerCase(), tpl.category);
                }
                if (tpl.categories) {
                    tpl.categories.forEach(c => categorySet.set(c.id, c.text));
                }
            });
            const dynamicCategories = [
                { id: 'all', text: t('template.allTemplates') },
                ...Array.from(categorySet.entries()).map(([id, text]) => ({ id, text }))
            ];
            setCategories(dynamicCategories);
        } catch (error) {
            console.error("Error loading templates:", error);
            setAllTemplates([]);
            setFilteredTemplates([]);
            toast.error(t('template.loadFailed'));
        } finally {
            setLoading(false);
        }
    };

    /** Turn the `createUser` / `updateUser` ids into display names, one fetch per distinct user. */
    const hydrateAuthors = async (list: Template[]) => {
        const ids = Array.from(new Set(list.map(tpl => tpl.authorId).filter(Boolean))) as string[];
        if (ids.length === 0) return;
        const briefs = await Promise.all(ids.map(async id => [id, await resolveUserBrief(id)] as const));
        const byId = new Map(briefs);
        setAllTemplates(prev => prev.map(tpl => {
            const brief = tpl.authorId ? byId.get(tpl.authorId) : undefined;
            return brief?.name ? { ...tpl, author: brief.name, authorAvatar: brief.avatar ?? tpl.authorAvatar } : tpl;
        }));
    };

    const handleDeleteTemplate = useCallback(async (e: React.MouseEvent, templateId: string) => {
        e.stopPropagation();
        try {
            await useApi(APIS.DELETE_TEMPLATE, { id: templateId });
            setAllTemplates(prev => prev.filter(tpl => tpl.id !== templateId));
            toast.success(t('template.deleteSuccess'));
        } catch (error) {
            toast.error(t('template.deleteFailed'));
        }
    }, [t]);

    const handleCategoryChange = (value: string[]) => {
        setSelectedCategories(value);
    };

    const handleUseTemplate = (item: Template) => {
        onCreateFromTemplate(item.id, item.title);
        onOpenChange(false);
    };

    // Offered both in the grid and in the empty state, so it lives in one place.
    const blankTile = onCreateBlank ? (
        <button
            type="button"
            className="flex h-[212px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-muted-foreground/30 px-4 text-center transition-colors hover:border-primary/50 hover:bg-muted/40"
            onClick={() => {
                onCreateBlank();
                onOpenChange(false);
            }}
        >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Plus className="h-4 w-4" />
            </span>
            <span className="text-sm font-medium">{t('template.blankPage')}</span>
            <span className="text-xs text-muted-foreground">{t('template.blankPageDesc')}</span>
        </button>
    ) : null;

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="w-[1000px] sm:max-w-none h-full flex flex-col">
                <SheetTitle className="flex flex-row items-center gap-1 shrink-0">
                    {t('template.selectTemplate')}
                </SheetTitle>
                {previewTemplate ? (
                    <div className="flex flex-col gap-3 mt-4 flex-1 min-h-0">
                        {/* Preview header — back button + title */}
                        <div className="flex items-center gap-2 shrink-0">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 gap-1 px-2"
                                onClick={() => setPreviewTemplate(null)}
                            >
                                <ArrowLeft className="h-4 w-4" />
                                <span className="text-sm">{t('template.back', 'Back')}</span>
                            </Button>
                            <span className="truncate text-sm font-semibold">{previewTemplate.title}</span>
                        </div>

                        {/* Template metadata */}
                        {(previewTemplate.description || (previewTemplate.tags && previewTemplate.tags.length > 0)) && (
                            <div className="shrink-0 space-y-1">
                                {previewTemplate.description && (
                                    <p className="text-xs text-muted-foreground">{previewTemplate.description}</p>
                                )}
                                {previewTemplate.tags && previewTemplate.tags.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                        {previewTemplate.tags.map(tag => (
                                            <span key={tag} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{tag}</span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Preview content — read-only editor rendering */}
                        <div className="flex-1 min-h-0 overflow-y-auto rounded-lg border bg-background">
                            <TemplatePreview
                                templateId={previewTemplate.id}
                                className="min-h-full"
                            />
                        </div>

                        {/* Footer — author info + use template button */}
                        <div className="flex items-center justify-between shrink-0">
                            <span className="text-xs text-muted-foreground">
                                {previewTemplate.author || t('template.unknownAuthor')}
                                {(previewTemplate.updatedAt || previewTemplate.createdAt) && (
                                    <> · {relativeTime(previewTemplate.updatedAt || previewTemplate.createdAt)}</>
                                )}
                            </span>
                            <Button
                                size="sm"
                                className="gap-1"
                                onClick={() => handleUseTemplate(previewTemplate)}
                            >
                                <Plus className="h-3.5 w-3.5" />
                                {t('template.useThis')}
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col gap-4 mt-4 flex-1 min-h-0">
                        <div className="flex flex-col gap-1">
                            <div className="flex flex-row items-baseline gap-2">
                                <span className="font-bold text-lg">{t('template.personalTemplates')}</span>
                                {allTemplates.length > 0 && (
                                    <span className="text-xs text-muted-foreground">
                                        {t('template.count', { total: allTemplates.length })}
                                    </span>
                                )}
                            </div>
                            <p className="text-xs text-muted-foreground">{t('template.personalTemplatesDesc')}</p>
                        </div>
                        <div className="flex flex-row items-center gap-4">
                            <Input
                                className="w-[300px] h-9"
                                placeholder={t('template.search')}
                                value={searchValue}
                                onChange={(e) => setSearchValue(e.target.value)}
                            />
                            {categories.length > 1 && (
                                <MultiSelect
                                    placeholder={t('template.typeFilter')}
                                    className="h-9 min-w-[180px]"
                                    options={categories.map(cat => ({ value: cat.id, label: cat.text }))}
                                    defaultValue={[]}
                                    value={selectedCategories}
                                    onValueChange={handleCategoryChange}
                                />
                            )}
                        </div>

                        {loading ? (
                            <div className="flex flex-1 justify-center items-center">
                                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
                            </div>
                        ) : filteredTemplates.length === 0 ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-center text-muted-foreground">
                                <FileText className="h-12 w-12 mb-4 text-muted-foreground/30" />
                                <p className="text-base font-medium mb-1">{t('template.noTemplates')}</p>
                                <p className="text-sm">
                                    {searchValue ? t('template.noMatch') : t('template.emptyHint')}
                                </p>
                                {!searchValue && blankTile && (
                                    <div className="mt-6 w-[260px]">{blankTile}</div>
                                )}
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 flex-1 min-h-0 overflow-y-auto content-start pr-1">
                                {!searchValue && blankTile}
                                {filteredTemplates.map((item, index) => {
                                    const timeLabel = relativeTime(item.updatedAt || item.createdAt);
                                    return (
                                        <Card
                                            key={`${item.id}-${index}`}
                                            className="group relative flex h-[212px] cursor-pointer flex-col overflow-hidden rounded-lg border shadow-sm transition-shadow hover:shadow-md"
                                            onClick={() => setPreviewTemplate(item)}
                                        >
                                            {/* Delete button - visible on hover */}
                                            <button
                                                className="absolute top-2 right-2 z-10 p-1.5 rounded-md bg-background/80 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive hover:text-destructive-foreground"
                                                onClick={(e) => handleDeleteTemplate(e, item.id)}
                                                title={t('template.delete')}
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </button>

                                            <div className="relative h-28 w-full shrink-0 overflow-hidden bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-blue-950 dark:to-indigo-900">
                                                {item.cover && item.cover.length > 0 ? (
                                                    <img
                                                        src={item.cover[0].startsWith('http') ? item.cover[0] : usePath(item.cover[0])}
                                                        alt={item.title}
                                                        className="h-full w-full object-cover"
                                                    />
                                                ) : (
                                                    <div className="flex h-full w-full items-center justify-center">
                                                        <FileText className="h-10 w-10 text-muted-foreground/40" />
                                                    </div>
                                                )}
                                                {item.tags && item.tags.length > 0 && (
                                                    <div className="absolute bottom-1.5 left-1.5 flex flex-row gap-1">
                                                        {item.tags.slice(0, 2).map(tag => (
                                                            <span
                                                                key={tag}
                                                                className="rounded bg-background/80 px-1.5 py-0.5 text-[10px] text-muted-foreground backdrop-blur-sm"
                                                            >
                                                                {tag}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                                {/* The whole card creates the page; this only makes that discoverable. */}
                                                <div className="absolute inset-0 hidden items-center justify-center bg-background/70 backdrop-blur-sm group-hover:flex">
                                                    <span className="rounded-md border bg-background px-2.5 py-1 text-xs font-medium shadow-sm">
                                                        {t('template.preview', 'Preview')}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="flex min-h-0 flex-1 flex-col p-3">
                                                <h3 className="truncate text-sm font-semibold" title={item.title}>{item.title}</h3>
                                                <p className="mt-1 line-clamp-2 flex-1 text-xs text-muted-foreground" title={item.description}>{item.description}</p>
                                                <div className="mt-2 flex flex-row items-center gap-1 text-[11px] text-muted-foreground">
                                                    <Clock className="h-3 w-3 shrink-0" />
                                                    <span className="max-w-[110px] truncate text-foreground/50">
                                                        {item.author || t('template.unknownAuthor')}
                                                    </span>
                                                    {timeLabel && (
                                                        <>
                                                            <span className="text-muted-foreground/40">·</span>
                                                            <span className="shrink-0">{timeLabel}</span>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </Card>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </SheetContent>
        </Sheet>
    );
};
