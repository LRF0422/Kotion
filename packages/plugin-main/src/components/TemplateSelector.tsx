import { Card, Input, MultiSelect, Sheet, SheetContent, SheetTitle, Button, toast } from "@kn/ui";
import { useApi, useUploadFile } from "@kn/core"
import { UserCircle } from "@kn/icon";
import React, { useState, useEffect } from "react";
import { APIS } from "../api";

// Mock template data
const MOCK_TEMPLATES = [
    {
        id: "1",
        title: "Project Management",
        description: "A comprehensive template for managing projects with timelines, tasks, and team collaboration.",
        cover: "/api/placeholder/300/200",
        author: "Leong",
        category: "Work",
        downloads: 1245,
        rating: 4.8,
    },
    {
        id: "2",
        title: "Personal Budget Planner",
        description: "Track your income, expenses, and savings goals in one place.",
        cover: "/api/placeholder/300/200",
        author: "Leong",
        category: "Finance",
        downloads: 876,
        rating: 4.6,
    },
    {
        id: "3",
        title: "Meeting Notes",
        description: "Structured template for capturing meeting agendas, decisions, and action items.",
        cover: "/api/placeholder/300/200",
        author: "Leong",
        category: "Productivity",
        downloads: 2103,
        rating: 4.9,
    },
    {
        id: "4",
        title: "Habit Tracker",
        description: "Build and maintain healthy habits with daily tracking and progress visualization.",
        cover: "/api/placeholder/300/200",
        author: "Leong",
        category: "Personal",
        downloads: 1542,
        rating: 4.7,
    },
    {
        id: "5",
        title: "Content Calendar",
        description: "Plan and organize your content strategy across multiple channels.",
        cover: "/api/placeholder/300/200",
        author: "Leong",
        category: "Marketing",
        downloads: 932,
        rating: 4.5,
    },
    {
        id: "6",
        title: "Study Planner",
        description: "Organize your study schedule, track progress, and manage learning materials.",
        cover: "/api/placeholder/300/200",
        author: "Leong",
        category: "Education",
        downloads: 765,
        rating: 4.4,
    }
];

const MOCK_CATEGORIES = [
    { id: "all", text: "All Templates" },
    { id: "work", text: "Work" },
    { id: "productivity", text: "Productivity" },
    { id: "personal", text: "Personal" },
    { id: "finance", text: "Finance" },
    { id: "education", text: "Education" },
    { id: "marketing", text: "Marketing" },
    { id: "health", text: "Health" },
];

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
    const [allTemplates, setAllTemplates] = useState<any[]>(MOCK_TEMPLATES);
    const [filteredTemplates, setFilteredTemplates] = useState<any[]>(MOCK_TEMPLATES);
    const [searchValue, setSearchValue] = useState<string>("");
    const [categories, setCategories] = useState<{ id: string; text: string }[]>(MOCK_CATEGORIES);
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
                template.title.toLowerCase().includes(searchValue.toLowerCase()) ||
                template.description.toLowerCase().includes(searchValue.toLowerCase())
            );
        }

        // Apply category filter
        if (selectedCategories.length > 0 && !selectedCategories.includes('all')) {
            result = result.filter(template =>
                selectedCategories.some(category =>
                    template.category.toLowerCase().includes(category.toLowerCase())
                )
            );
        }

        setFilteredTemplates(result);
    }, [searchValue, allTemplates, selectedCategories]);

    const loadTemplates = async () => {
        setLoading(true);
        try {
            // Fetch user's templates
            const templateResponse = await useApi(APIS.QUERY_TEMPLATE);
            const templatesData = Array.isArray(templateResponse.data) ? templateResponse.data : [];
            setAllTemplates(MOCK_TEMPLATES);
            setFilteredTemplates(templatesData);
        } catch (error) {
            console.error("Error loading templates:", error);
            // Use mock data as fallback
            setAllTemplates(MOCK_TEMPLATES);
            setFilteredTemplates(MOCK_TEMPLATES);
            setCategories(MOCK_CATEGORIES);
            toast.error("Using sample templates");
        } finally {
            setLoading(false);
        }
    };

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
                        <MultiSelect
                            placeholder="模板类型"
                            className="h-9 min-w-[180px]"
                            options={categories.map(cat => ({ value: cat.id, label: cat.text }))}
                            defaultValue={[]}
                            value={selectedCategories}
                            onValueChange={handleCategoryChange}
                        />
                    </div>

                    {loading ? (
                        <div className="flex justify-center items-center h-64">
                            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                            {filteredTemplates.map((item: any, index: number) => (
                                <div key={`${item.id}-${index}`} className="flex flex-col gap-3">
                                    <Card
                                        className="border rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow h-[200px] cursor-pointer group"
                                        onClick={() => {
                                            onCreateFromTemplate(item.id);
                                            onOpenChange(false); // Close the sheet after selection
                                        }}
                                    >
                                        <div className="w-full h-32 bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
                                            {/* Placeholder for cover image */}
                                            <div className="bg-gray-200 border-2 border-dashed rounded-xl w-16 h-16 flex items-center justify-center text-gray-500">
                                                📝
                                            </div>
                                        </div>
                                        <div className="p-3">
                                            <h3 className="font-semibold text-sm truncate" title={item.title}>{item.title}</h3>
                                            <p className="text-xs text-gray-500 mt-1 line-clamp-2" title={item.description}>{item.description}</p>
                                        </div>
                                    </Card>
                                    <div className="flex flex-row justify-between items-center text-xs text-gray-500">
                                        <div className="flex items-center gap-1">
                                            <UserCircle className="h-3 w-3" />
                                            <span>{item.author}</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <span className="text-yellow-500">★</span>
                                            <span>{item.rating}</span>
                                        </div>
                                    </div>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="w-full"
                                        onClick={(e) => {
                                            e.stopPropagation(); // Prevent card click event
                                            onCreateFromTemplate(item.id);
                                            onOpenChange(false); // Close the sheet after selection
                                        }}
                                    >
                                        使用此模板
                                    </Button>
                                </div>
                            ))}
                            {filteredTemplates.length === 0 && (
                                <div className="col-span-full text-center py-12 text-gray-500">
                                    <div className="flex justify-center mb-4">
                                        <div className="bg-gray-100 border-2 border-dashed rounded-xl w-16 h-16 flex items-center justify-center text-gray-400">
                                            📄
                                        </div>
                                    </div>
                                    <p>没有找到匹配您搜索的模板。</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
};