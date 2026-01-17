import React, { useState, useEffect } from "react";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@kn/ui";
import {
    Button,
    Input,
    Label,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Separator,
    Switch,
    Textarea,
} from "@kn/ui";
import {
    DragDropContext,
    Droppable,
    Draggable,
    DropResult,
} from "react-beautiful-dnd";
import {
    GripVertical,
    Eye,
    EyeOff,
    Plus,
    Trash2,
    Edit2,
    Check,
    X,
    Settings,
} from "@kn/icon";
import { FieldConfig, FieldType, SelectOption } from "../../types";
import { cn } from "@kn/ui";
import { FieldPropertiesEditor } from "./FieldPropertiesEditor";

interface FieldConfigPanelProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    fields: FieldConfig[];
    onUpdateField: (fieldId: string, updates: Partial<FieldConfig>) => void;
    onDeleteField: (fieldId: string) => void;
    onAddField: (field: FieldConfig) => void;
    onReorderFields: (newOrder: FieldConfig[]) => void;
}

const FIELD_TYPE_OPTIONS = [
    { value: FieldType.TEXT, label: "文本" },
    { value: FieldType.NUMBER, label: "数字" },
    { value: FieldType.SELECT, label: "单选" },
    { value: FieldType.MULTI_SELECT, label: "多选" },
    { value: FieldType.DATE, label: "日期" },
    { value: FieldType.CHECKBOX, label: "复选框" },
    { value: FieldType.RATING, label: "评分" },
    { value: FieldType.PROGRESS, label: "进度" },
    { value: FieldType.URL, label: "链接" },
    { value: FieldType.EMAIL, label: "邮箱" },
    { value: FieldType.PHONE, label: "电话" },
];

export const FieldConfigPanel: React.FC<FieldConfigPanelProps> = ({
    open,
    onOpenChange,
    fields,
    onUpdateField,
    onDeleteField,
    onAddField,
    onReorderFields,
}) => {
    const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
    const [editingFieldTitle, setEditingFieldTitle] = useState("");
    const [showAddField, setShowAddField] = useState(false);
    const [newFieldTitle, setNewFieldTitle] = useState("");
    const [newFieldType, setNewFieldType] = useState<FieldType>(FieldType.TEXT);
    const [editingPropertiesFieldId, setEditingPropertiesFieldId] = useState<string | null>(null);

    // 新字段的配置选项
    const [newFieldOptions, setNewFieldOptions] = useState<SelectOption[]>([
        { id: "1", label: "选项1", color: "#3b82f6" },
        { id: "2", label: "选项2", color: "#10b981" },
        { id: "3", label: "选项3", color: "#f59e0b" },
    ]);
    const [newFieldFormat, setNewFieldFormat] = useState<string>("");
    const [newFieldDescription, setNewFieldDescription] = useState("");
    const [newFieldWidth, setNewFieldWidth] = useState(150);
    const [newOptionLabel, setNewOptionLabel] = useState("");

    // 重置新字段表单
    const resetNewFieldForm = () => {
        setNewFieldTitle("");
        setNewFieldType(FieldType.TEXT);
        setNewFieldOptions([
            { id: "1", label: "选项1", color: "#3b82f6" },
            { id: "2", label: "选项2", color: "#10b981" },
            { id: "3", label: "选项3", color: "#f59e0b" },
        ]);
        setNewFieldFormat("");
        setNewFieldDescription("");
        setNewFieldWidth(150);
        setNewOptionLabel("");
        setShowAddField(false);
    };

    // 获取字段类型的默认格式
    const getDefaultFormat = (type: FieldType): string => {
        switch (type) {
            case FieldType.NUMBER:
                return "number";
            case FieldType.DATE:
                return "yyyy-MM-dd";
            case FieldType.TEXT:
                return "single";
            case FieldType.RATING:
                return "5";
            case FieldType.PROGRESS:
                return "bar";
            case FieldType.URL:
            case FieldType.EMAIL:
            case FieldType.PHONE:
                return "sameTab";
            default:
                return "";
        }
    };

    // 当字段类型变化时，更新默认格式
    useEffect(() => {
        setNewFieldFormat(getDefaultFormat(newFieldType));
    }, [newFieldType]);

    // 处理字段拖拽排序
    const handleDragEnd = (result: DropResult) => {
        if (!result.destination) return;

        const items = Array.from(fields);
        const [reorderedItem] = items.splice(result.source.index, 1);
        if (!reorderedItem) return; // Safety check
        items.splice(result.destination.index, 0, reorderedItem);

        onReorderFields(items);
    };

    // 开始编辑字段名称
    const startEditField = (field: FieldConfig) => {
        setEditingFieldId(field.id);
        setEditingFieldTitle(field.title);
    };

    // 保存字段名称
    const saveFieldTitle = (fieldId: string) => {
        if (editingFieldTitle.trim()) {
            onUpdateField(fieldId, { title: editingFieldTitle.trim() });
        }
        setEditingFieldId(null);
        setEditingFieldTitle("");
    };

    // 取消编辑
    const cancelEdit = () => {
        setEditingFieldId(null);
        setEditingFieldTitle("");
    };

    // 添加新字段
    const handleAddNewField = () => {
        if (!newFieldTitle.trim()) return;

        const newField: FieldConfig = {
            id: `field_${Date.now()}`,
            title: newFieldTitle.trim(),
            type: newFieldType,
            width: newFieldWidth,
            isShow: true,
            description: newFieldDescription || undefined,
            format: newFieldFormat || undefined,
        };

        // 为单选和多选字段添加选项
        if (newFieldType === FieldType.SELECT || newFieldType === FieldType.MULTI_SELECT) {
            newField.options = newFieldOptions;
        }

        onAddField(newField);
        resetNewFieldForm();
    };

    // 添加新选项（用于单选/多选字段）
    const addNewOption = () => {
        if (!newOptionLabel.trim()) return;
        const newOption: SelectOption = {
            id: `option_${Date.now()}`,
            label: newOptionLabel.trim(),
            color: getRandomColor(),
        };
        setNewFieldOptions([...newFieldOptions, newOption]);
        setNewOptionLabel("");
    };

    // 更新选项
    const updateNewOption = (optionId: string, updates: Partial<SelectOption>) => {
        setNewFieldOptions(newFieldOptions.map((opt) =>
            opt.id === optionId ? { ...opt, ...updates } : opt
        ));
    };

    // 删除选项
    const deleteNewOption = (optionId: string) => {
        setNewFieldOptions(newFieldOptions.filter((opt) => opt.id !== optionId));
    };

    // 渲染新字段的类型特定配置
    const renderNewFieldTypeConfig = () => {
        switch (newFieldType) {
            case FieldType.SELECT:
            case FieldType.MULTI_SELECT:
                return (
                    <div className="space-y-3">
                        <div>
                            <Label className="text-xs font-semibold">选项列表</Label>
                            <div className="mt-2 space-y-2">
                                {newFieldOptions.map((option) => (
                                    <div key={option.id} className="flex items-center gap-2">
                                        <div
                                            className="w-4 h-4 rounded"
                                            style={{ backgroundColor: option.color }}
                                        />
                                        <Input
                                            value={option.label}
                                            onChange={(e) =>
                                                updateNewOption(option.id, { label: e.target.value })
                                            }
                                            className="h-8 flex-1"
                                        />
                                        <input
                                            type="color"
                                            value={option.color}
                                            onChange={(e) =>
                                                updateNewOption(option.id, { color: e.target.value })
                                            }
                                            className="w-8 h-8 rounded border cursor-pointer"
                                        />
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => deleteNewOption(option.id)}
                                        >
                                            <Trash2 className="h-3 w-3 text-destructive" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <Input
                                value={newOptionLabel}
                                onChange={(e) => setNewOptionLabel(e.target.value)}
                                placeholder="新选项名称"
                                className="h-8 flex-1"
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") addNewOption();
                                }}
                            />
                            <Button size="sm" onClick={addNewOption} disabled={!newOptionLabel.trim()}>
                                <Plus className="h-4 w-4 mr-1" />
                                添加
                            </Button>
                        </div>
                    </div>
                );
            case FieldType.NUMBER:
                return (
                    <div>
                        <Label htmlFor="newFieldFormat" className="text-xs">数字格式</Label>
                        <Select value={newFieldFormat || "number"} onValueChange={setNewFieldFormat}>
                            <SelectTrigger className="h-8 mt-1">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="number">数字</SelectItem>
                                <SelectItem value="currency">货币</SelectItem>
                                <SelectItem value="percent">百分比</SelectItem>
                                <SelectItem value="decimal">小数</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                );
            case FieldType.DATE:
                return (
                    <div>
                        <Label htmlFor="newFieldFormat" className="text-xs">日期格式</Label>
                        <Select value={newFieldFormat || "yyyy-MM-dd"} onValueChange={setNewFieldFormat}>
                            <SelectTrigger className="h-8 mt-1">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="yyyy-MM-dd">2024-01-15</SelectItem>
                                <SelectItem value="yyyy/MM/dd">2024/01/15</SelectItem>
                                <SelectItem value="MM-dd-yyyy">01-15-2024</SelectItem>
                                <SelectItem value="dd/MM/yyyy">15/01/2024</SelectItem>
                                <SelectItem value="yyyy-MM-dd HH:mm">2024-01-15 14:30</SelectItem>
                                <SelectItem value="yyyy-MM-dd HH:mm:ss">2024-01-15 14:30:00</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                );
            case FieldType.TEXT:
                return (
                    <div>
                        <Label htmlFor="newFieldFormat" className="text-xs">文本类型</Label>
                        <Select value={newFieldFormat || "single"} onValueChange={setNewFieldFormat}>
                            <SelectTrigger className="h-8 mt-1">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="single">单行文本</SelectItem>
                                <SelectItem value="multi">多行文本</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                );
            case FieldType.RATING:
                return (
                    <div>
                        <Label htmlFor="newFieldFormat" className="text-xs">最大评分</Label>
                        <Select value={newFieldFormat || "5"} onValueChange={setNewFieldFormat}>
                            <SelectTrigger className="h-8 mt-1">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="5">5星</SelectItem>
                                <SelectItem value="10">10星</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                );
            case FieldType.PROGRESS:
                return (
                    <div>
                        <Label htmlFor="newFieldFormat" className="text-xs">进度显示</Label>
                        <Select value={newFieldFormat || "bar"} onValueChange={setNewFieldFormat}>
                            <SelectTrigger className="h-8 mt-1">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="bar">进度条</SelectItem>
                                <SelectItem value="ring">环形</SelectItem>
                                <SelectItem value="number">数字</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                );
            case FieldType.URL:
            case FieldType.EMAIL:
            case FieldType.PHONE:
                return (
                    <div className="flex items-center justify-between">
                        <Label htmlFor="openInNewTab" className="text-xs">新标签页打开</Label>
                        <Switch
                            id="openInNewTab"
                            checked={newFieldFormat === "newTab"}
                            onCheckedChange={(checked) =>
                                setNewFieldFormat(checked ? "newTab" : "sameTab")
                            }
                        />
                    </div>
                );
            default:
                return null;
        }
    };

    // 获取随机颜色
    const getRandomColor = (): string => {
        const colors = [
            "#3b82f6", "#10b981", "#f59e0b", "#ef4444",
            "#8b5cf6", "#ec4899", "#14b8a6", "#f97316",
        ];
        return colors[Math.floor(Math.random() * colors.length)] as string;
    };

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="w-[400px] sm:w-[540px] overflow-y-auto">
                <SheetHeader>
                    <SheetTitle>配置列</SheetTitle>
                    <SheetDescription>
                        管理字段的显示、顺序和属性
                    </SheetDescription>
                </SheetHeader>

                <div className="mt-6 space-y-4">
                    {/* 字段列表 */}
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <Label className="text-sm font-semibold">字段列表</Label>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setShowAddField(!showAddField)}
                            >
                                <Plus className="h-4 w-4 mr-1" />
                                添加字段
                            </Button>
                        </div>

                        {/* 添加字段表单 */}
                        {showAddField && (
                            <div className="mb-4 p-3 border rounded-lg bg-muted/30 space-y-3">
                                <div>
                                    <Label htmlFor="newFieldTitle" className="text-xs">
                                        字段名称
                                    </Label>
                                    <Input
                                        id="newFieldTitle"
                                        value={newFieldTitle}
                                        onChange={(e) => setNewFieldTitle(e.target.value)}
                                        placeholder="输入字段名称"
                                        className="h-8 mt-1"
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="newFieldType" className="text-xs">
                                        字段类型
                                    </Label>
                                    <Select
                                        value={newFieldType}
                                        onValueChange={(value) => setNewFieldType(value as FieldType)}
                                    >
                                        <SelectTrigger className="h-8 mt-1">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {FIELD_TYPE_OPTIONS.map((option) => (
                                                <SelectItem key={option.value} value={option.value}>
                                                    {option.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* 字段类型特定配置 */}
                                {renderNewFieldTypeConfig()}

                                <Separator />

                                {/* 通用配置 */}
                                <div>
                                    <Label htmlFor="newFieldWidth" className="text-xs">
                                        列宽
                                    </Label>
                                    <Input
                                        id="newFieldWidth"
                                        type="number"
                                        value={newFieldWidth}
                                        onChange={(e) => setNewFieldWidth(parseInt(e.target.value) || 150)}
                                        className="h-8 mt-1"
                                        min={80}
                                        max={500}
                                    />
                                </div>

                                <div>
                                    <Label htmlFor="newFieldDescription" className="text-xs">
                                        字段描述（可选）
                                    </Label>
                                    <Textarea
                                        id="newFieldDescription"
                                        value={newFieldDescription}
                                        onChange={(e) => setNewFieldDescription(e.target.value)}
                                        placeholder="为字段添加描述信息..."
                                        className="mt-1 min-h-[60px]"
                                    />
                                </div>

                                <div className="flex gap-2">
                                    <Button
                                        size="sm"
                                        onClick={handleAddNewField}
                                        disabled={!newFieldTitle.trim()}
                                    >
                                        <Check className="h-4 w-4 mr-1" />
                                        确认
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={resetNewFieldForm}
                                    >
                                        <X className="h-4 w-4 mr-1" />
                                        取消
                                    </Button>
                                </div>
                            </div>
                        )}

                        <Separator className="my-3" />

                        {/* 可拖拽字段列表 */}
                        <DragDropContext onDragEnd={handleDragEnd}>
                            <Droppable droppableId="fields">
                                {(provided) => (
                                    <div
                                        {...provided.droppableProps}
                                        ref={provided.innerRef}
                                        className="space-y-2"
                                    >
                                        {fields.map((field, index) => (
                                            <Draggable
                                                key={field.id}
                                                draggableId={field.id}
                                                index={index}
                                                isDragDisabled={field.type === FieldType.ID}
                                            >
                                                {(provided, snapshot) => (
                                                    <div
                                                        ref={provided.innerRef}
                                                        {...provided.draggableProps}
                                                        className={cn(
                                                            "flex items-center gap-2 p-3 border rounded-lg bg-background transition-shadow",
                                                            snapshot.isDragging && "shadow-lg",
                                                            field.type === FieldType.ID && "opacity-50"
                                                        )}
                                                    >
                                                        {/* 拖拽手柄 */}
                                                        <div
                                                            {...provided.dragHandleProps}
                                                            className={cn(
                                                                "cursor-grab active:cursor-grabbing",
                                                                field.type === FieldType.ID && "cursor-not-allowed"
                                                            )}
                                                        >
                                                            <GripVertical className="h-4 w-4 text-muted-foreground" />
                                                        </div>

                                                        {/* 字段名称 */}
                                                        <div className="flex-1 min-w-0">
                                                            {editingFieldId === field.id ? (
                                                                <Input
                                                                    value={editingFieldTitle}
                                                                    onChange={(e) => setEditingFieldTitle(e.target.value)}
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === "Enter") saveFieldTitle(field.id);
                                                                        if (e.key === "Escape") cancelEdit();
                                                                    }}
                                                                    className="h-8"
                                                                    autoFocus
                                                                />
                                                            ) : (
                                                                <div>
                                                                    <div className="font-medium text-sm truncate">
                                                                        {field.title}
                                                                    </div>
                                                                    <div className="text-xs text-muted-foreground">
                                                                        {FIELD_TYPE_OPTIONS.find((opt) => opt.value === field.type)?.label || field.type}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* 操作按钮 */}
                                                        <div>

                                                            {/* 字段属性配置面板 */}
                                                            <div className="flex items-center gap-1">
                                                                {editingFieldId === field.id ? (
                                                                    <>
                                                                        <Button
                                                                            size="sm"
                                                                            variant="ghost"
                                                                            onClick={() => saveFieldTitle(field.id)}
                                                                        >
                                                                            <Check className="h-3 w-3" />
                                                                        </Button>
                                                                        <Button
                                                                            size="sm"
                                                                            variant="ghost"
                                                                            onClick={cancelEdit}
                                                                        >
                                                                            <X className="h-3 w-3" />
                                                                        </Button>
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        {/* 显示/隐藏切换 */}
                                                                        <Button
                                                                            size="sm"
                                                                            variant="ghost"
                                                                            onClick={() =>
                                                                                onUpdateField(field.id, { isShow: !field.isShow })
                                                                            }
                                                                            disabled={field.type === FieldType.ID}
                                                                        >
                                                                            {field.isShow ? (
                                                                                <Eye className="h-4 w-4" />
                                                                            ) : (
                                                                                <EyeOff className="h-4 w-4" />
                                                                            )}
                                                                        </Button>

                                                                        {/* 编辑按钮 */}
                                                                        <Button
                                                                            size="sm"
                                                                            variant="ghost"
                                                                            onClick={() => startEditField(field)}
                                                                            disabled={field.type === FieldType.ID}
                                                                        >
                                                                            <Edit2 className="h-3 w-3" />
                                                                        </Button>

                                                                        {/* 属性配置按钮 */}
                                                                        <Button
                                                                            size="sm"
                                                                            variant="ghost"
                                                                            onClick={() =>
                                                                                setEditingPropertiesFieldId(
                                                                                    editingPropertiesFieldId === field.id
                                                                                        ? null
                                                                                        : field.id
                                                                                )
                                                                            }
                                                                            disabled={field.type === FieldType.ID}
                                                                        >
                                                                            <Settings className="h-3 w-3" />
                                                                        </Button>

                                                                        {/* 删除按钮 */}
                                                                        <Button
                                                                            size="sm"
                                                                            variant="ghost"
                                                                            onClick={() => onDeleteField(field.id)}
                                                                            disabled={field.type === FieldType.ID}
                                                                        >
                                                                            <Trash2 className="h-3 w-3 text-destructive" />
                                                                        </Button>
                                                                    </>
                                                                )}
                                                            </div>
                                                            {editingPropertiesFieldId === field.id && (
                                                                <div className="mt-2 p-3 border-t bg-muted/20">
                                                                    <FieldPropertiesEditor
                                                                        field={field}
                                                                        onUpdateField={(updates) =>
                                                                            onUpdateField(field.id, updates)
                                                                        }
                                                                    />
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </Draggable>
                                        ))}
                                        {provided.placeholder}
                                    </div>
                                )}
                            </Droppable>
                        </DragDropContext>
                    </div>

                    {/* 提示信息 */}
                    <div className="mt-6 p-3 bg-muted/50 rounded-lg">
                        <p className="text-xs text-muted-foreground">
                            💡 提示：
                        </p>
                        <ul className="text-xs text-muted-foreground mt-2 space-y-1">
                            <li>• 拖拽字段可以调整显示顺序</li>
                            <li>• 点击眼睛图标可以显示/隐藏字段</li>
                            <li>• 点击设置图标可以配置字段属性</li>
                            <li>• 不同字段类型有不同的可配置属性</li>
                            <li>• ID字段不可删除、隐藏或移动</li>
                            <li>• 删除字段会同时删除该字段的所有数据</li>
                        </ul>
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
};
