import React, { useState, useEffect } from "react";
import { generateFieldId, generateOptionId } from "../../utils/id";
import { useTranslation } from "@kn/common";
import { getConversionWarning } from "../../utils/fieldConversion";
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
    Popover,
    PopoverContent,
    PopoverTrigger,
    Alert,
    AlertDescription,
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
    ChevronRight,
    AlertTriangle,
    RefreshCw,
} from "@kn/icon";
import { FieldConfig, FieldType, SelectOption } from "../../types";
import { cn } from "@kn/ui";

interface FieldConfigPanelProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    fields: FieldConfig[];
    onUpdateField: (fieldId: string, updates: Partial<FieldConfig>) => void;
    onDeleteField: (fieldId: string) => void;
    onAddField: (field: FieldConfig) => void;
    onReorderFields: (newOrder: FieldConfig[]) => void;
    onConvertFieldType?: (fieldId: string, newType: FieldType, newOptions?: SelectOption[]) => void;
}

// Field type options - using translation keys
const getFieldTypeOptions = (t: (key: string) => string) => [
    { value: FieldType.TEXT, label: t('bitable.fieldTypes.text') },
    { value: FieldType.NUMBER, label: t('bitable.fieldTypes.number') },
    { value: FieldType.SELECT, label: t('bitable.fieldTypes.select') },
    { value: FieldType.MULTI_SELECT, label: t('bitable.fieldTypes.multiSelect') },
    { value: FieldType.DATE, label: t('bitable.fieldTypes.date') },
    { value: FieldType.CHECKBOX, label: t('bitable.fieldTypes.checkbox') },
    { value: FieldType.RATING, label: t('bitable.fieldTypes.rating') },
    { value: FieldType.PROGRESS, label: t('bitable.fieldTypes.progress') },
    { value: FieldType.URL, label: t('bitable.fieldTypes.url') },
    { value: FieldType.EMAIL, label: t('bitable.fieldTypes.email') },
    { value: FieldType.PHONE, label: t('bitable.fieldTypes.phone') },
];

// Single field configuration popover component
interface FieldConfigPopoverProps {
    field: FieldConfig;
    onUpdateField: (updates: Partial<FieldConfig>) => void;
    onDeleteField: () => void;
    onConvertFieldType?: (newType: FieldType, newOptions?: SelectOption[]) => void;
    children: React.ReactNode;
}

const FieldConfigPopover: React.FC<FieldConfigPopoverProps> = ({
    field,
    onUpdateField,
    onDeleteField,
    onConvertFieldType,
    children,
}) => {
    const { t } = useTranslation();
    const FIELD_TYPE_OPTIONS = getFieldTypeOptions(t);
    const [localTitle, setLocalTitle] = useState(field.title);
    const [localType, setLocalType] = useState(field.type);
    const [localOptions, setLocalOptions] = useState<SelectOption[]>(
        (field.options as SelectOption[]) || []
    );
    const [localFormat, setLocalFormat] = useState(field.format || "");
    const [localWidth, setLocalWidth] = useState(field.width || 150);
    const [localDescription, setLocalDescription] = useState(field.description || "");
    const [newOptionLabel, setNewOptionLabel] = useState("");
    const [isOpen, setIsOpen] = useState(false);
    const [showTypeConversion, setShowTypeConversion] = useState(false);
    const [conversionTargetType, setConversionTargetType] = useState<FieldType>(field.type);
    const [conversionOptions, setConversionOptions] = useState<SelectOption[]>([]);

    // Sync local state when field changes
    useEffect(() => {
        setLocalTitle(field.title);
        setLocalType(field.type);
        setLocalOptions((field.options as SelectOption[]) || []);
        setLocalFormat(field.format || "");
        setLocalWidth(field.width || 150);
        setLocalDescription(field.description || "");
    }, [field]);

    // Get random color for new options
    const getRandomColor = (): string => {
        const colors = [
            "#3b82f6", "#10b981", "#f59e0b", "#ef4444",
            "#8b5cf6", "#ec4899", "#14b8a6", "#f97316",
        ];
        return colors[Math.floor(Math.random() * colors.length)] as string;
    };

    // Handle save on popover close
    const handleSave = () => {
        const updates: Partial<FieldConfig> = {};

        if (localTitle !== field.title) updates.title = localTitle;
        if (localFormat !== field.format) updates.format = localFormat;
        if (localWidth !== field.width) updates.width = localWidth;
        if (localDescription !== field.description) updates.description = localDescription;
        if (JSON.stringify(localOptions) !== JSON.stringify(field.options)) {
            updates.options = localOptions;
        }

        if (Object.keys(updates).length > 0) {
            onUpdateField(updates);
        }
    };

    const handleOpenChange = (open: boolean) => {
        if (!open) {
            handleSave();
        }
        setIsOpen(open);
    };

    // Add new option for select fields
    const addOption = () => {
        if (!newOptionLabel.trim()) return;
        const newOption: SelectOption = {
            id: generateOptionId(),
            label: newOptionLabel.trim(),
            color: getRandomColor(),
        };
        setLocalOptions([...localOptions, newOption]);
        setNewOptionLabel("");
    };

    // Update option
    const updateOption = (optionId: string, updates: Partial<SelectOption>) => {
        setLocalOptions(localOptions.map((opt) =>
            opt.id === optionId ? { ...opt, ...updates } : opt
        ));
    };

    // Delete option
    const deleteOption = (optionId: string) => {
        setLocalOptions(localOptions.filter((opt) => opt.id !== optionId));
    };

    // Render type-specific config
    const renderTypeConfig = () => {
        switch (localType) {
            case FieldType.SELECT:
            case FieldType.MULTI_SELECT:
                return (
                    <div className="space-y-3">
                        <Label className="text-xs font-semibold">{t('bitable.fieldConfig.optionsList')}</Label>
                        <div className="space-y-2 max-h-[200px] overflow-y-auto">
                            {localOptions.map((option) => (
                                <div key={option.id} className="flex items-center gap-2">
                                    <input
                                        type="color"
                                        value={option.color}
                                        onChange={(e) => updateOption(option.id, { color: e.target.value })}
                                        className="w-6 h-6 rounded border cursor-pointer"
                                    />
                                    <Input
                                        value={option.label}
                                        onChange={(e) => updateOption(option.id, { label: e.target.value })}
                                        className="h-8 flex-1"
                                    />
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-8 w-8 p-0"
                                        onClick={() => deleteOption(option.id)}
                                    >
                                        <Trash2 className="h-3 w-3 text-destructive" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                        <div className="flex gap-2">
                            <Input
                                value={newOptionLabel}
                                onChange={(e) => setNewOptionLabel(e.target.value)}
                                placeholder={t('bitable.fieldConfig.newOptionPlaceholder')}
                                className="h-8 flex-1"
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        e.preventDefault();
                                        addOption();
                                    }
                                }}
                            />
                            <Button size="sm" variant="outline" onClick={addOption} disabled={!newOptionLabel.trim()}>
                                <Plus className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                );
            case FieldType.NUMBER:
                return (
                    <div>
                        <Label className="text-xs">{t('bitable.formats.numberFormat')}</Label>
                        <Select value={localFormat || "number"} onValueChange={setLocalFormat}>
                            <SelectTrigger className="h-8 mt-1">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="number">{t('bitable.formats.number')}</SelectItem>
                                <SelectItem value="currency">{t('bitable.formats.currency')}</SelectItem>
                                <SelectItem value="percent">{t('bitable.formats.percent')}</SelectItem>
                                <SelectItem value="decimal">{t('bitable.formats.decimal')}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                );
            case FieldType.DATE:
                return (
                    <div>
                        <Label className="text-xs">{t('bitable.formats.dateFormat')}</Label>
                        <Select value={localFormat || "yyyy-MM-dd"} onValueChange={setLocalFormat}>
                            <SelectTrigger className="h-8 mt-1">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="yyyy-MM-dd">2024-01-15</SelectItem>
                                <SelectItem value="yyyy/MM/dd">2024/01/15</SelectItem>
                                <SelectItem value="MM-dd-yyyy">01-15-2024</SelectItem>
                                <SelectItem value="dd/MM/yyyy">15/01/2024</SelectItem>
                                <SelectItem value="yyyy-MM-dd HH:mm">2024-01-15 14:30</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                );
            case FieldType.TEXT:
                return (
                    <div>
                        <Label className="text-xs">{t('bitable.formats.textType')}</Label>
                        <Select value={localFormat || "single"} onValueChange={setLocalFormat}>
                            <SelectTrigger className="h-8 mt-1">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="single">{t('bitable.formats.singleLine')}</SelectItem>
                                <SelectItem value="multi">{t('bitable.formats.multiLine')}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                );
            case FieldType.RATING:
                return (
                    <div>
                        <Label className="text-xs">{t('bitable.formats.maxRating')}</Label>
                        <Select value={localFormat || "5"} onValueChange={setLocalFormat}>
                            <SelectTrigger className="h-8 mt-1">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="5">{t('bitable.formats.stars5')}</SelectItem>
                                <SelectItem value="10">{t('bitable.formats.stars10')}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                );
            case FieldType.PROGRESS:
                return (
                    <div>
                        <Label className="text-xs">{t('bitable.formats.progressDisplay')}</Label>
                        <Select value={localFormat || "bar"} onValueChange={setLocalFormat}>
                            <SelectTrigger className="h-8 mt-1">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="bar">{t('bitable.formats.progressBar')}</SelectItem>
                                <SelectItem value="ring">{t('bitable.formats.progressRing')}</SelectItem>
                                <SelectItem value="number">{t('bitable.formats.progressNumber')}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                );
            case FieldType.URL:
            case FieldType.EMAIL:
            case FieldType.PHONE:
                return (
                    <div className="flex items-center justify-between">
                        <Label className="text-xs">{t('bitable.formats.openNewTab')}</Label>
                        <Switch
                            checked={localFormat === "newTab"}
                            onCheckedChange={(checked) => setLocalFormat(checked ? "newTab" : "sameTab")}
                        />
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <Popover open={isOpen} onOpenChange={handleOpenChange}>
            <PopoverTrigger asChild>
                {children}
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="start" side="right">
                <div className="p-4 space-y-4">
                    {/* Field name */}
                    <div>
                        <Label className="text-xs font-semibold">{t('bitable.fieldConfig.fieldName')}</Label>
                        <Input
                            value={localTitle}
                            onChange={(e) => setLocalTitle(e.target.value)}
                            className="h-9 mt-1"
                            placeholder={t('bitable.fieldConfig.fieldNamePlaceholder')}
                        />
                    </div>

                    {/* Field type (read-only display) */}
                    <div>
                        <Label className="text-xs font-semibold">{t('bitable.fieldConfig.fieldType')}</Label>
                        <div className="mt-1 px-3 py-2 text-sm bg-muted rounded-md">
                            {FIELD_TYPE_OPTIONS.find((opt) => opt.value === localType)?.label || localType}
                        </div>
                    </div>

                    <Separator />

                    {/* Type-specific config */}
                    {renderTypeConfig()}

                    {/* Common config */}
                    <div>
                        <Label className="text-xs">{t('bitable.fieldConfig.columnWidth')}</Label>
                        <Input
                            type="number"
                            value={localWidth}
                            onChange={(e) => setLocalWidth(parseInt(e.target.value) || 150)}
                            className="h-8 mt-1"
                            min={80}
                            max={500}
                        />
                    </div>

                    <div>
                        <Label className="text-xs">{t('bitable.fieldConfig.fieldDescription')}</Label>
                        <Textarea
                            value={localDescription}
                            onChange={(e) => setLocalDescription(e.target.value)}
                            placeholder={t('bitable.fieldConfig.fieldDescriptionPlaceholder')}
                            className="mt-1 min-h-[60px]"
                        />
                    </div>

                    <Separator />

                    {/* Field Type Conversion */}
                    {onConvertFieldType && (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <Label className="text-xs font-semibold">{t('bitable.fieldConfig.convertFieldType')}</Label>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 text-xs"
                                    onClick={() => setShowTypeConversion(!showTypeConversion)}
                                >
                                    <RefreshCw className="h-3 w-3 mr-1" />
                                    {showTypeConversion ? t('bitable.actions.cancel') : 'Change'}
                                </Button>
                            </div>

                            {showTypeConversion && (
                                <div className="space-y-3 p-3 bg-muted/30 rounded-md">
                                    <p className="text-xs text-muted-foreground">
                                        {t('bitable.fieldConfig.convertFieldTypeDescription')}
                                    </p>

                                    <div>
                                        <Label className="text-xs">{t('bitable.fieldConfig.currentType')}</Label>
                                        <div className="mt-1 px-3 py-2 text-sm bg-background rounded-md border">
                                            {FIELD_TYPE_OPTIONS.find((opt) => opt.value === localType)?.label || localType}
                                        </div>
                                    </div>

                                    <div>
                                        <Label className="text-xs">{t('bitable.fieldConfig.newType')}</Label>
                                        <Select value={conversionTargetType} onValueChange={(value) => {
                                            setConversionTargetType(value as FieldType);
                                            // Initialize options for select types
                                            if (value === FieldType.SELECT || value === FieldType.MULTI_SELECT) {
                                                setConversionOptions([
                                                    { id: "1", label: t('bitable.defaultOptions.option1'), color: "#3b82f6" },
                                                    { id: "2", label: t('bitable.defaultOptions.option2'), color: "#10b981" },
                                                    { id: "3", label: t('bitable.defaultOptions.option3'), color: "#f59e0b" },
                                                ]);
                                            }
                                        }}>
                                            <SelectTrigger className="h-8 mt-1">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {FIELD_TYPE_OPTIONS.filter(opt => opt.value !== FieldType.ID).map((option) => (
                                                    <SelectItem key={option.value} value={option.value}>
                                                        {option.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {/* Warning if conversion might lose data */}
                                    {getConversionWarning(localType, conversionTargetType) && (
                                        <Alert variant="destructive" className="py-2">
                                            <AlertTriangle className="h-3 w-3" />
                                            <AlertDescription className="text-xs">
                                                {getConversionWarning(localType, conversionTargetType)}
                                            </AlertDescription>
                                        </Alert>
                                    )}

                                    {/* Options configuration for select types */}
                                    {(conversionTargetType === FieldType.SELECT || conversionTargetType === FieldType.MULTI_SELECT) && (
                                        <div className="space-y-2">
                                            <Label className="text-xs">{t('bitable.fieldConfig.optionsList')}</Label>
                                            <div className="space-y-2 max-h-[150px] overflow-y-auto">
                                                {conversionOptions.map((option) => (
                                                    <div key={option.id} className="flex items-center gap-2">
                                                        <input
                                                            type="color"
                                                            value={option.color}
                                                            onChange={(e) => {
                                                                setConversionOptions(conversionOptions.map((opt) =>
                                                                    opt.id === option.id ? { ...opt, color: e.target.value } : opt
                                                                ));
                                                            }}
                                                            className="w-5 h-5 rounded border cursor-pointer"
                                                        />
                                                        <Input
                                                            value={option.label}
                                                            onChange={(e) => {
                                                                setConversionOptions(conversionOptions.map((opt) =>
                                                                    opt.id === option.id ? { ...opt, label: e.target.value } : opt
                                                                ));
                                                            }}
                                                            className="h-7 flex-1 text-xs"
                                                        />
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            className="h-7 w-7 p-0"
                                                            onClick={() => {
                                                                setConversionOptions(conversionOptions.filter((opt) => opt.id !== option.id));
                                                            }}
                                                        >
                                                            <Trash2 className="h-3 w-3 text-destructive" />
                                                        </Button>
                                                    </div>
                                                ))}
                                            </div>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="w-full h-7 text-xs"
                                                onClick={() => {
                                                    setConversionOptions([...conversionOptions, {
                                                        id: generateOptionId(),
                                                        label: `Option ${conversionOptions.length + 1}`,
                                                        color: getRandomColor(),
                                                    }]);
                                                }}
                                            >
                                                <Plus className="h-3 w-3 mr-1" />
                                                {t('bitable.actions.add')}
                                            </Button>
                                        </div>
                                    )}

                                    <Button
                                        size="sm"
                                        className="w-full"
                                        disabled={conversionTargetType === localType}
                                        onClick={() => {
                                            if (onConvertFieldType) {
                                                const options = (conversionTargetType === FieldType.SELECT || conversionTargetType === FieldType.MULTI_SELECT)
                                                    ? conversionOptions
                                                    : undefined;
                                                onConvertFieldType(conversionTargetType, options);
                                                setShowTypeConversion(false);
                                                setIsOpen(false);
                                            }
                                        }}
                                    >
                                        <RefreshCw className="h-3 w-3 mr-2" />
                                        {t('bitable.fieldConfig.convertButton')}
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}

                    <Separator />

                    {/* Delete button */}
                    <Button
                        variant="destructive"
                        size="sm"
                        className="w-full"
                        onClick={() => {
                            onDeleteField();
                            setIsOpen(false);
                        }}
                    >
                        <Trash2 className="h-4 w-4 mr-2" />
                        {t('bitable.fieldConfig.deleteField')}
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    );
};

export const FieldConfigPanel: React.FC<FieldConfigPanelProps> = ({
    open,
    onOpenChange,
    fields,
    onUpdateField,
    onDeleteField,
    onAddField,
    onReorderFields,
    onConvertFieldType,
}) => {
    const { t } = useTranslation();
    const FIELD_TYPE_OPTIONS = getFieldTypeOptions(t);
    const [showAddField, setShowAddField] = useState(false);
    const [newFieldTitle, setNewFieldTitle] = useState("");
    const [newFieldType, setNewFieldType] = useState<FieldType>(FieldType.TEXT);

    // 新字段的配置选项
    const [newFieldOptions, setNewFieldOptions] = useState<SelectOption[]>([
        { id: "1", label: t('bitable.defaultOptions.option1'), color: "#3b82f6" },
        { id: "2", label: t('bitable.defaultOptions.option2'), color: "#10b981" },
        { id: "3", label: t('bitable.defaultOptions.option3'), color: "#f59e0b" },
    ]);
    const [newFieldFormat, setNewFieldFormat] = useState<string>("");
    const [newOptionLabel, setNewOptionLabel] = useState("");

    // 重置新字段表单
    const resetNewFieldForm = () => {
        setNewFieldTitle("");
        setNewFieldType(FieldType.TEXT);
        setNewFieldOptions([
            { id: "1", label: t('bitable.defaultOptions.option1'), color: "#3b82f6" },
            { id: "2", label: t('bitable.defaultOptions.option2'), color: "#10b981" },
            { id: "3", label: t('bitable.defaultOptions.option3'), color: "#f59e0b" },
        ]);
        setNewFieldFormat("");
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

    // 添加新字段
    const handleAddNewField = () => {
        if (!newFieldTitle.trim()) return;

        const newField: FieldConfig = {
            id: generateFieldId(),
            title: newFieldTitle.trim(),
            type: newFieldType,
            width: 150,
            isShow: true,
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
            id: generateOptionId(),
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
                            <Label className="text-xs font-semibold">{t('bitable.fieldConfig.optionsList')}</Label>
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
                                placeholder={t('bitable.fieldConfig.newOptionPlaceholder')}
                                className="h-8 flex-1"
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") addNewOption();
                                }}
                            />
                            <Button size="sm" onClick={addNewOption} disabled={!newOptionLabel.trim()}>
                                <Plus className="h-4 w-4 mr-1" />
                                {t('bitable.actions.add')}
                            </Button>
                        </div>
                    </div>
                );
            case FieldType.NUMBER:
                return (
                    <div>
                        <Label htmlFor="newFieldFormat" className="text-xs">{t('bitable.formats.numberFormat')}</Label>
                        <Select value={newFieldFormat || "number"} onValueChange={setNewFieldFormat}>
                            <SelectTrigger className="h-8 mt-1">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="number">{t('bitable.formats.number')}</SelectItem>
                                <SelectItem value="currency">{t('bitable.formats.currency')}</SelectItem>
                                <SelectItem value="percent">{t('bitable.formats.percent')}</SelectItem>
                                <SelectItem value="decimal">{t('bitable.formats.decimal')}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                );
            case FieldType.DATE:
                return (
                    <div>
                        <Label htmlFor="newFieldFormat" className="text-xs">{t('bitable.formats.dateFormat')}</Label>
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
                        <Label htmlFor="newFieldFormat" className="text-xs">{t('bitable.formats.textType')}</Label>
                        <Select value={newFieldFormat || "single"} onValueChange={setNewFieldFormat}>
                            <SelectTrigger className="h-8 mt-1">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="single">{t('bitable.formats.singleLine')}</SelectItem>
                                <SelectItem value="multi">{t('bitable.formats.multiLine')}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                );
            case FieldType.RATING:
                return (
                    <div>
                        <Label htmlFor="newFieldFormat" className="text-xs">{t('bitable.formats.maxRating')}</Label>
                        <Select value={newFieldFormat || "5"} onValueChange={setNewFieldFormat}>
                            <SelectTrigger className="h-8 mt-1">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="5">{t('bitable.formats.stars5')}</SelectItem>
                                <SelectItem value="10">{t('bitable.formats.stars10')}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                );
            case FieldType.PROGRESS:
                return (
                    <div>
                        <Label htmlFor="newFieldFormat" className="text-xs">{t('bitable.formats.progressDisplay')}</Label>
                        <Select value={newFieldFormat || "bar"} onValueChange={setNewFieldFormat}>
                            <SelectTrigger className="h-8 mt-1">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="bar">{t('bitable.formats.progressBar')}</SelectItem>
                                <SelectItem value="ring">{t('bitable.formats.progressRing')}</SelectItem>
                                <SelectItem value="number">{t('bitable.formats.progressNumber')}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                );
            case FieldType.URL:
            case FieldType.EMAIL:
            case FieldType.PHONE:
                return (
                    <div className="flex items-center justify-between">
                        <Label htmlFor="openInNewTab" className="text-xs">{t('bitable.formats.openNewTab')}</Label>
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
                    <SheetTitle>{t('bitable.fieldConfig.title')}</SheetTitle>
                    <SheetDescription>
                        {t('bitable.fieldConfig.description')}
                    </SheetDescription>
                </SheetHeader>

                <div className="mt-6 space-y-4">
                    {/* 字段列表 */}
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <Label className="text-sm font-semibold">{t('bitable.fieldConfig.fieldList')}</Label>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setShowAddField(!showAddField)}
                            >
                                <Plus className="h-4 w-4 mr-1" />
                                {t('bitable.fieldConfig.addField')}
                            </Button>
                        </div>

                        {/* 添加字段表单 */}
                        {showAddField && (
                            <div className="mb-4 p-3 border rounded-lg bg-muted/30 space-y-3">
                                <div>
                                    <Label htmlFor="newFieldTitle" className="text-xs">
                                        {t('bitable.fieldConfig.fieldName')}
                                    </Label>
                                    <Input
                                        id="newFieldTitle"
                                        value={newFieldTitle}
                                        onChange={(e) => setNewFieldTitle(e.target.value)}
                                        placeholder={t('bitable.fieldConfig.fieldNamePlaceholder')}
                                        className="h-8 mt-1"
                                        autoFocus
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="newFieldType" className="text-xs">
                                        {t('bitable.fieldConfig.fieldType')}
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

                                <div className="flex gap-2 pt-2">
                                    <Button
                                        size="sm"
                                        onClick={handleAddNewField}
                                        disabled={!newFieldTitle.trim()}
                                        className="flex-1"
                                    >
                                        {t('bitable.fieldConfig.confirmAdd')}
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={resetNewFieldForm}
                                    >
                                        {t('bitable.actions.cancel')}
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
                                        className="space-y-1"
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
                                                            "group flex items-center gap-2 px-2 py-2 rounded-md bg-background transition-all hover:bg-muted/50 border",
                                                            snapshot.isDragging && "shadow-lg bg-background",
                                                            field.type === FieldType.ID && "opacity-50"
                                                        )}
                                                    >
                                                        {/* 拖拽手柄 */}
                                                        <div
                                                            {...provided.dragHandleProps}
                                                            className={cn(
                                                                "cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity",
                                                                field.type === FieldType.ID && "cursor-not-allowed"
                                                            )}
                                                        >
                                                            <GripVertical className="h-4 w-4 text-muted-foreground" />
                                                        </div>

                                                        {/* 显示/隐藏状态指示 */}
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            className="h-6 w-6 p-0"
                                                            onClick={() => onUpdateField(field.id, { isShow: !field.isShow })}
                                                            disabled={field.type === FieldType.ID}
                                                        >
                                                            {field.isShow ? (
                                                                <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                                                            ) : (
                                                                <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                                                            )}
                                                        </Button>

                                                        {/* 字段信息 - 点击打开配置 Popover */}
                                                        {field.type === FieldType.ID ? (
                                                            <div className="flex-1 min-w-0 flex items-center justify-between py-1">
                                                                <div>
                                                                    <div className="font-medium text-sm truncate">{field.title}</div>
                                                                    <div className="text-xs text-muted-foreground">
                                                                        {FIELD_TYPE_OPTIONS.find((opt) => opt.value === field.type)?.label || field.type}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <FieldConfigPopover
                                                                field={field}
                                                                onUpdateField={(updates) => onUpdateField(field.id, updates)}
                                                                onDeleteField={() => onDeleteField(field.id)}
                                                                onConvertFieldType={onConvertFieldType ? (newType, newOptions) => onConvertFieldType(field.id, newType, newOptions) : undefined}
                                                            >
                                                                <div className="flex-1 min-w-0 flex items-center justify-between cursor-pointer py-1 px-2 rounded hover:bg-muted transition-colors">
                                                                    <div>
                                                                        <div className="font-medium text-sm truncate">{field.title}</div>
                                                                        <div className="text-xs text-muted-foreground">
                                                                            {FIELD_TYPE_OPTIONS.find((opt) => opt.value === field.type)?.label || field.type}
                                                                        </div>
                                                                    </div>
                                                                    <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                                                </div>
                                                            </FieldConfigPopover>
                                                        )}
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
                            💡 {t('bitable.tips.title')}：
                        </p>
                        <ul className="text-xs text-muted-foreground mt-2 space-y-1">
                            <li>• {t('bitable.tips.dragToReorder')}</li>
                            <li>• {t('bitable.tips.clickEyeToToggle')}</li>
                            <li>• {t('bitable.tips.clickFieldToConfigure')}</li>
                            <li>• {t('bitable.tips.idFieldLocked')}</li>
                        </ul>
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
};
