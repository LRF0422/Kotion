import React, { useState } from "react";
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
} from "@kn/icon";
import { FieldConfig, FieldType } from "../../types";
import { cn } from "@kn/ui";

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
            width: 150,
            isShow: true,
        };

        // 为单选和多选字段添加默认选项
        if (newFieldType === FieldType.SELECT || newFieldType === FieldType.MULTI_SELECT) {
            newField.options = [
                { id: "1", label: "选项1", color: "#3b82f6" },
                { id: "2", label: "选项2", color: "#10b981" },
                { id: "3", label: "选项3", color: "#f59e0b" },
            ];
        }

        onAddField(newField);

        // 重置表单
        setNewFieldTitle("");
        setNewFieldType(FieldType.TEXT);
        setShowAddField(false);
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
                                        onClick={() => {
                                            setShowAddField(false);
                                            setNewFieldTitle("");
                                            setNewFieldType(FieldType.TEXT);
                                        }}
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
                            <li>• ID字段不可删除、隐藏或移动</li>
                            <li>• 删除字段会同时删除该字段的所有数据</li>
                        </ul>
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
};
