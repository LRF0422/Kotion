import { Card, Input, MultiSelect, Sheet, SheetContent, SheetTitle, Button, toast } from "@kn/ui";
import { useApi, useUploadFile, useTranslation } from "@kn/common"
import { UserCircle, Trash2, FileText } from "@kn/icon";
import React, { useState, useEffect, useCallback } from "react";
import { APIS } from "../api";
import { Template } from "../model/Template";

interface TemplateSelectorProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreateFromTemplate: (templateId: string, title?: string) => void;
}

/**
 * Normalize a raw template record from the backend into the shape the cards
 * render. The backend's field names aren't guaranteed to match exactly
 * (e.g. it stores the template name as `name`, and `cover` may come back as a
 * single string), so we apply defensive fallbacks here.
 */
const normalizeTemplate = (item: any, untitled: string): Template => {
    const coverRaw = item?.cover;
    const cover = Array.isArray(coverRaw) ? coverRaw : (coverRaw ? [coverRaw] : []);
    return {
        ...item,
        id: item?.id,
        title: item?.title ?? item?.name ?? untitled,
        description: item?.description ?? "",
        cover,
        author: item?.author ?? item?.authorName ?? "",
        category: item?.category ?? item?.categories?.[0]?.text ?? "",
    };
};

export const TemplateSelector: React.FC<TemplateSelectorProps> = ({
    open,
    onOpenChange,
    onCreateFromTemplate
}) => {
    const [allTemplates, setAllTemplates] = useState<Template[]>([]);
    const [filteredTemplates, setFilteredTemplates] = useState<Template[]>([]);
    const [searchValue, setSearchValue] = useState<string>("");
    const [categories, setCategories] = useState<{ id: string; text: string }[]>([]);
    const [loading, setLoading] = useState<boolean>(false);

    const { usePath } = useUploadFile();
    const { t } = useTranslation();

    // Load templates when the sheet opens
    useEffect(() => {
        if (open) {
            loadTemplates();
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
                    template.category?.toLowerCase().includes(category.toLowerCase())
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

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="w-[1000px] sm:max-w-none h-full flex flex-col">
                <SheetTitle className="flex flex-row items-center gap-1 shrink-0">
                    {t('template.selectTemplate')}
                </SheetTitle>
                <div className="flex flex-col gap-4 mt-4 flex-1 min-h-0">
                    <div className="font-bold text-lg">{t('template.personalTemplates')}</div>
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
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 flex-1 min-h-0 overflow-y-auto content-start">
                            {filteredTemplates.map((item, index) => (
                                <div key={`${item.id}-${index}`} className="flex flex-col gap-3">
                                    <Card
                                        className="border rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow h-[200px] cursor-pointer group relative"
                                        onClick={() => {
                                            onCreateFromTemplate(item.id, item.title);
                                            onOpenChange(false);
                                        }}
                                    >
                                        {/* Delete button - visible on hover */}
                                        <button
                                            className="absolute top-2 right-2 z-10 p-1.5 rounded-md bg-background/80 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive hover:text-destructive-foreground"
                                            onClick={(e) => handleDeleteTemplate(e, item.id)}
                                            title={t('template.delete')}
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>

                                        <div className="w-full h-32 bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-blue-950 dark:to-indigo-900 flex items-center justify-center overflow-hidden">
                                            {item.cover && item.cover.length > 0 ? (
                                                <img
                                                    src={item.cover[0].startsWith('http') ? item.cover[0] : usePath(item.cover[0])}
                                                    alt={item.title}
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : (
                                                <FileText className="h-10 w-10 text-muted-foreground/40" />
                                            )}
                                        </div>
                                        <div className="p-3">
                                            <h3 className="font-semibold text-sm truncate" title={item.title}>{item.title}</h3>
                                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2" title={item.description}>{item.description}</p>
                                        </div>
                                    </Card>
                                    <div className="flex flex-row justify-between items-center text-xs text-muted-foreground">
                                        <div className="flex items-center gap-1">
                                            <UserCircle className="h-3 w-3" />
                                            <span>{item.author}</span>
                                        </div>
                                        {item.category && (
                                            <span className="text-xs bg-muted px-1.5 py-0.5 rounded">{item.category}</span>
                                        )}
                                    </div>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="w-full"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onCreateFromTemplate(item.id, item.title);
                                            onOpenChange(false);
                                        }}
                                    >
                                        {t('template.useThis')}
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
};
