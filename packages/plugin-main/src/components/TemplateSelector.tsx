import { Card, Input, MultiSelect, Sheet, SheetContent, SheetTitle, Button, toast } from "@kn/ui";
import { useApi, useUploadFile } from "@kn/core"
import { UserCircle, Trash2, FileText } from "@kn/icon";
import React, { useState, useEffect, useCallback } from "react";
import { APIS } from "../api";
import { Template } from "../model/Template";

interface TemplateSelectorProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreateFromTemplate: (templateId: string) => void;
}

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
            const templatesData: Template[] = Array.isArray(templateResponse.data) ? templateResponse.data : [];
            setAllTemplates(templatesData);
            setFilteredTemplates(templatesData);

            // Extract categories dynamically from templates
            const categorySet = new Map<string, string>();
            templatesData.forEach(t => {
                if (t.category) {
                    categorySet.set(t.category.toLowerCase(), t.category);
                }
                if (t.categories) {
                    t.categories.forEach(c => categorySet.set(c.id, c.text));
                }
            });
            const dynamicCategories = [
                { id: 'all', text: 'All Templates' },
                ...Array.from(categorySet.entries()).map(([id, text]) => ({ id, text }))
            ];
            setCategories(dynamicCategories);
        } catch (error) {
            console.error("Error loading templates:", error);
            setAllTemplates([]);
            setFilteredTemplates([]);
            toast.error("加载模板失败");
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteTemplate = useCallback(async (e: React.MouseEvent, templateId: string) => {
        e.stopPropagation();
        try {
            await useApi(APIS.DELETE_TEMPLATE, { id: templateId });
            setAllTemplates(prev => prev.filter(t => t.id !== templateId));
            toast.success("删除模板成功");
        } catch (error) {
            toast.error("删除模板失败");
        }
    }, []);

    const handleCategoryChange = (value: string[]) => {
        setSelectedCategories(value);
    };

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="w-[1000px] sm:max-w-none max-h-[90vh] overflow-y-auto">
                <SheetTitle className="flex flex-row items-center gap-1">
                    选择一个模板
                </SheetTitle>
                <div className="flex flex-col gap-4 mt-4">
                    <div className="font-bold text-lg">个人模板</div>
                    <div className="flex flex-row items-center gap-4">
                        <Input
                            className="w-[300px] h-9"
                            placeholder="搜索模板..."
                            value={searchValue}
                            onChange={(e) => setSearchValue(e.target.value)}
                        />
                        {categories.length > 1 && (
                            <MultiSelect
                                placeholder="模板类型"
                                className="h-9 min-w-[180px]"
                                options={categories.map(cat => ({ value: cat.id, label: cat.text }))}
                                defaultValue={[]}
                                value={selectedCategories}
                                onValueChange={handleCategoryChange}
                            />
                        )}
                    </div>

                    {loading ? (
                        <div className="flex justify-center items-center h-64">
                            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                            {filteredTemplates.map((item, index) => (
                                <div key={`${item.id}-${index}`} className="flex flex-col gap-3">
                                    <Card
                                        className="border rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow h-[200px] cursor-pointer group relative"
                                        onClick={() => {
                                            onCreateFromTemplate(item.id);
                                            onOpenChange(false);
                                        }}
                                    >
                                        {/* Delete button - visible on hover */}
                                        <button
                                            className="absolute top-2 right-2 z-10 p-1.5 rounded-md bg-background/80 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive hover:text-destructive-foreground"
                                            onClick={(e) => handleDeleteTemplate(e, item.id)}
                                            title="删除模板"
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
                                            onCreateFromTemplate(item.id);
                                            onOpenChange(false);
                                        }}
                                    >
                                        使用此模板
                                    </Button>
                                </div>
                            ))}
                            {filteredTemplates.length === 0 && (
                                <div className="col-span-full text-center py-16 text-muted-foreground">
                                    <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground/30" />
                                    <p className="text-base font-medium mb-1">暂无模板</p>
                                    <p className="text-sm">
                                        {searchValue ? "没有找到匹配的模板，请尝试其他关键词" : "在编辑器中保存页面为模板后，将在此处显示"}
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
};
