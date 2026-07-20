/**
 * Field property editing form — extracted from FieldConfigPanel.tsx.
 * Shows in a popover when clicking a field row in the config panel.
 * Handles: field name, type display, type-specific config, column width,
 * description, type conversion, and delete.
 */
import React, { useState, useEffect } from "react";
import { useTranslation } from "@kn/common";
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
    ColorPicker,
} from "@kn/ui";
import {
    Trash2,
    Plus,
    AlertTriangle,
    RefreshCw,
} from "@kn/icon";
import { FieldConfig, FieldType, SelectOption } from "../../../types";
import { generateOptionId } from "../../../utils/id";
import { getRandomOptionColor, PRESET_COLORS } from "../../../utils/colors";
import { getConversionWarning } from "../../../utils/fieldConversion";
import { FieldTypeSelector } from "./FieldTypeSelector";

// ---------------------------------------------------------------------------
// Color picker — uses unified ColorPicker from @kn/ui
// ---------------------------------------------------------------------------
const BitableColorPicker: React.FC<{
    value: string;
    onChange: (color: string) => void;
    t: (key: string) => string;
}> = ({ value, onChange }) => {
    const swatches = PRESET_COLORS.map((c) => c.value);
    return (
        <ColorPicker
            value={value}
            onChange={onChange}
            swatches={swatches}
            trigger="toggle"
            align="start"
        />
    );
};

// ---------------------------------------------------------------------------
// Shared type-config renderer (used by property form + add-field form)
// ---------------------------------------------------------------------------
interface TypeConfigProps {
    type: FieldType;
    format: string;
    options: SelectOption[];
    onFormatChange: (format: string) => void;
    onOptionsChange: (options: SelectOption[]) => void;
    t: (...args: any[]) => any;
    labelIdPrefix?: string;
}

export const FieldTypeConfig: React.FC<TypeConfigProps> = ({
    type,
    format,
    options,
    onFormatChange,
    onOptionsChange,
    t,
    labelIdPrefix = "fieldFormat",
}) => {
    const [newOptionLabel, setNewOptionLabel] = useState("");

    const addOption = () => {
        if (!newOptionLabel.trim()) return;
        onOptionsChange([
            ...options,
            {
                id: generateOptionId(),
                label: newOptionLabel.trim(),
                color: getRandomOptionColor(),
            },
        ]);
        setNewOptionLabel("");
    };

    const updateOption = (optionId: string, updates: Partial<SelectOption>) => {
        onOptionsChange(
            options.map((opt) => (opt.id === optionId ? { ...opt, ...updates } : opt))
        );
    };

    const deleteOption = (optionId: string) => {
        onOptionsChange(options.filter((opt) => opt.id !== optionId));
    };

    switch (type) {
        case FieldType.SELECT:
        case FieldType.MULTI_SELECT:
            return (
                <div className="space-y-3">
                    <Label className="text-xs font-semibold">
                        {t("bitable.fieldConfig.optionsList")}
                    </Label>
                    <div className="space-y-2 max-h-[200px] overflow-y-auto">
                        {options.map((option) => (
                            <div key={option.id} className="flex items-center gap-2">
                                <BitableColorPicker
                                    value={option.color}
                                    onChange={(color) => updateOption(option.id, { color })}
                                    t={t}
                                />
                                <Input
                                    value={option.label}
                                    onChange={(e) =>
                                        updateOption(option.id, { label: e.target.value })
                                    }
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
                            placeholder={t("bitable.fieldConfig.newOptionPlaceholder")}
                            className="h-8 flex-1"
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    addOption();
                                }
                            }}
                        />
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={addOption}
                            disabled={!newOptionLabel.trim()}
                        >
                            <Plus className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            );
        case FieldType.NUMBER:
            return (
                <div>
                    <Label htmlFor={labelIdPrefix} className="text-xs">
                        {t("bitable.formats.numberFormat")}
                    </Label>
                    <Select value={format || "number"} onValueChange={onFormatChange}>
                        <SelectTrigger className="h-8 mt-1">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="number">{t("bitable.formats.number")}</SelectItem>
                            <SelectItem value="currency">{t("bitable.formats.currency")}</SelectItem>
                            <SelectItem value="percent">{t("bitable.formats.percent")}</SelectItem>
                            <SelectItem value="decimal">{t("bitable.formats.decimal")}</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            );
        case FieldType.DATE:
            return (
                <div>
                    <Label htmlFor={labelIdPrefix} className="text-xs">
                        {t("bitable.formats.dateFormat")}
                    </Label>
                    <Select value={format || "yyyy-MM-dd"} onValueChange={onFormatChange}>
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
                    <Label htmlFor={labelIdPrefix} className="text-xs">
                        {t("bitable.formats.textType")}
                    </Label>
                    <Select value={format || "single"} onValueChange={onFormatChange}>
                        <SelectTrigger className="h-8 mt-1">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="single">{t("bitable.formats.singleLine")}</SelectItem>
                            <SelectItem value="multi">{t("bitable.formats.multiLine")}</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            );
        case FieldType.RATING:
            return (
                <div>
                    <Label htmlFor={labelIdPrefix} className="text-xs">
                        {t("bitable.formats.maxRating")}
                    </Label>
                    <Select value={format || "5"} onValueChange={onFormatChange}>
                        <SelectTrigger className="h-8 mt-1">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="5">{t("bitable.formats.stars5")}</SelectItem>
                            <SelectItem value="10">{t("bitable.formats.stars10")}</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            );
        case FieldType.PROGRESS:
            return (
                <div>
                    <Label htmlFor={labelIdPrefix} className="text-xs">
                        {t("bitable.formats.progressDisplay")}
                    </Label>
                    <Select value={format || "bar"} onValueChange={onFormatChange}>
                        <SelectTrigger className="h-8 mt-1">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="bar">{t("bitable.formats.progressBar")}</SelectItem>
                            <SelectItem value="ring">{t("bitable.formats.progressRing")}</SelectItem>
                            <SelectItem value="number">{t("bitable.formats.progressNumber")}</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            );
        case FieldType.URL:
        case FieldType.EMAIL:
        case FieldType.PHONE:
            return (
                <div className="flex items-center justify-between">
                    <Label htmlFor={labelIdPrefix} className="text-xs">
                        {t("bitable.formats.openNewTab")}
                    </Label>
                    <Switch
                        id={labelIdPrefix}
                        checked={format === "newTab"}
                        onCheckedChange={(checked) =>
                            onFormatChange(checked ? "newTab" : "sameTab")
                        }
                    />
                </div>
            );
        case FieldType.IMAGE:
            return (
                <div className="space-y-3">
                    <div>
                        <Label htmlFor={labelIdPrefix} className="text-xs">
                            {t("bitable.formats.imageCount")}
                        </Label>
                        <Select
                            value={format?.split(":")[0] || "multiple"}
                            onValueChange={(v) => {
                                const parts = format?.split(":") || ["multiple", "medium"];
                                onFormatChange(`${v}:${parts[1] || "medium"}`);
                            }}
                        >
                            <SelectTrigger className="h-8 mt-1">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="single">{t("bitable.formats.singleImage")}</SelectItem>
                                <SelectItem value="multiple">{t("bitable.formats.multipleImages")}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div>
                        <Label className="text-xs">{t("bitable.formats.thumbnailSize")}</Label>
                        <Select
                            value={format?.split(":")[1] || "medium"}
                            onValueChange={(v) => {
                                const parts = format?.split(":") || ["multiple", "medium"];
                                onFormatChange(`${parts[0] || "multiple"}:${v}`);
                            }}
                        >
                            <SelectTrigger className="h-8 mt-1">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="small">{t("bitable.formats.sizeSmall")}</SelectItem>
                                <SelectItem value="medium">{t("bitable.formats.sizeMedium")}</SelectItem>
                                <SelectItem value="large">{t("bitable.formats.sizeLarge")}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            );
        case FieldType.PERSON:
            return (
                <div>
                    <Label className="text-xs">
                        {t("bitable.formats.selectionCount", "Selection")}
                    </Label>
                    <Select value={format || "single"} onValueChange={onFormatChange}>
                        <SelectTrigger className="h-8 mt-1">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="single">{t("bitable.formats.singlePerson", "Single person")}</SelectItem>
                            <SelectItem value="multiple">{t("bitable.formats.multiplePeople", "Multiple people")}</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            );
        case FieldType.ATTACHMENT:
            return (
                <div>
                    <Label className="text-xs">
                        {t("bitable.formats.selectionCount", "Selection")}
                    </Label>
                    <Select value={format || "multiple"} onValueChange={onFormatChange}>
                        <SelectTrigger className="h-8 mt-1">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="single">{t("bitable.formats.singleFile", "Single file")}</SelectItem>
                            <SelectItem value="multiple">{t("bitable.formats.multipleFiles", "Multiple files")}</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            );
        default:
            return null;
    }
};

// ---------------------------------------------------------------------------
// Field property form (popover)
// ---------------------------------------------------------------------------
export interface FieldPropertyFormProps {
    field: FieldConfig;
    onUpdateField: (updates: Partial<FieldConfig>) => void;
    onDeleteField: () => void;
    onConvertFieldType?: (newType: FieldType, newOptions?: SelectOption[]) => void;
    children: React.ReactNode;
}

export const FieldPropertyForm: React.FC<FieldPropertyFormProps> = ({
    field,
    onUpdateField,
    onDeleteField,
    onConvertFieldType,
    children,
}) => {
    const { t } = useTranslation();
    const [localTitle, setLocalTitle] = useState(field.title);
    const [localType, setLocalType] = useState(field.type);
    const [localOptions, setLocalOptions] = useState<SelectOption[]>(
        (field.options as SelectOption[]) || []
    );
    const [localFormat, setLocalFormat] = useState(field.format || "");
    const [localWidth, setLocalWidth] = useState(field.width || 150);
    const [localDescription, setLocalDescription] = useState(field.description || "");
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

    // Save on close
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
        if (!open) handleSave();
        setIsOpen(open);
    };

    return (
        <Popover open={isOpen} onOpenChange={handleOpenChange}>
            <PopoverTrigger asChild>{children}</PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="start" side="right">
                <div className="p-4 space-y-4">
                    {/* Field name */}
                    <div>
                        <Label className="text-xs font-semibold">
                            {t("bitable.fieldConfig.fieldName")}
                        </Label>
                        <Input
                            value={localTitle}
                            onChange={(e) => setLocalTitle(e.target.value)}
                            className="h-9 mt-1"
                            placeholder={t("bitable.fieldConfig.fieldNamePlaceholder")}
                        />
                    </div>

                    {/* Field type (read-only display) */}
                    <div>
                        <Label className="text-xs font-semibold">
                            {t("bitable.fieldConfig.fieldType")}
                        </Label>
                        <div className="mt-1 px-3 py-2 text-sm bg-muted rounded-md">
                            {t(`bitable.fieldTypes.${localType}`) || localType}
                        </div>
                    </div>

                    <Separator />

                    {/* Type-specific config */}
                    <FieldTypeConfig
                        type={localType}
                        format={localFormat}
                        options={localOptions}
                        onFormatChange={setLocalFormat}
                        onOptionsChange={setLocalOptions}
                        t={t}
                    />

                    {/* Common config */}
                    <div>
                        <Label className="text-xs">{t("bitable.fieldConfig.columnWidth")}</Label>
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
                        <Label className="text-xs">
                            {t("bitable.fieldConfig.fieldDescription")}
                        </Label>
                        <Textarea
                            value={localDescription}
                            onChange={(e) => setLocalDescription(e.target.value)}
                            placeholder={t("bitable.fieldConfig.fieldDescriptionPlaceholder")}
                            className="mt-1 min-h-[60px]"
                        />
                    </div>

                    <Separator />

                    {/* Type conversion */}
                    {onConvertFieldType && (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <Label className="text-xs font-semibold">
                                    {t("bitable.fieldConfig.convertFieldType")}
                                </Label>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 text-xs"
                                    onClick={() => setShowTypeConversion(!showTypeConversion)}
                                >
                                    <RefreshCw className="h-3 w-3 mr-1" />
                                    {showTypeConversion
                                        ? t("bitable.actions.cancel")
                                        : "Change"}
                                </Button>
                            </div>

                            {showTypeConversion && (
                                <div className="space-y-3 p-3 bg-muted/30 rounded-md">
                                    <p className="text-xs text-muted-foreground">
                                        {t("bitable.fieldConfig.convertFieldTypeDescription")}
                                    </p>

                                    <div>
                                        <Label className="text-xs">
                                            {t("bitable.fieldConfig.currentType")}
                                        </Label>
                                        <div className="mt-1 px-3 py-2 text-sm bg-background rounded-md border">
                                            {t(`bitable.fieldTypes.${localType}`) || localType}
                                        </div>
                                    </div>

                                    <div>
                                        <Label className="text-xs">
                                            {t("bitable.fieldConfig.newType")}
                                        </Label>
                                        <div className="mt-1">
                                            <FieldTypeSelector
                                                value={conversionTargetType}
                                                onChange={(type) => {
                                                    setConversionTargetType(type);
                                                    if (
                                                        type === FieldType.SELECT ||
                                                        type === FieldType.MULTI_SELECT
                                                    ) {
                                                        setConversionOptions([
                                                            { id: "1", label: t("bitable.defaultOptions.option1"), color: "#3b82f6" },
                                                            { id: "2", label: t("bitable.defaultOptions.option2"), color: "#10b981" },
                                                            { id: "3", label: t("bitable.defaultOptions.option3"), color: "#f59e0b" },
                                                        ]);
                                                    }
                                                }}
                                                disabledTypes={[FieldType.ID]}
                                            />
                                        </div>
                                    </div>

                                    {getConversionWarning(localType, conversionTargetType) && (
                                        <Alert variant="destructive" className="py-2">
                                            <AlertTriangle className="h-3 w-3" />
                                            <AlertDescription className="text-xs">
                                                {getConversionWarning(localType, conversionTargetType)}
                                            </AlertDescription>
                                        </Alert>
                                    )}

                                    {(conversionTargetType === FieldType.SELECT ||
                                        conversionTargetType === FieldType.MULTI_SELECT) && (
                                        <div className="space-y-2">
                                            <Label className="text-xs">
                                                {t("bitable.fieldConfig.optionsList")}
                                            </Label>
                                            <div className="space-y-2 max-h-[150px] overflow-y-auto">
                                                {conversionOptions.map((option) => (
                                                    <div key={option.id} className="flex items-center gap-2">
                                                        <input
                                                            type="color"
                                                            value={option.color}
                                                            onChange={(e) => {
                                                                setConversionOptions(
                                                                    conversionOptions.map((opt) =>
                                                                        opt.id === option.id
                                                                            ? { ...opt, color: e.target.value }
                                                                            : opt
                                                                    )
                                                                );
                                                            }}
                                                            className="w-5 h-5 rounded border cursor-pointer"
                                                        />
                                                        <Input
                                                            value={option.label}
                                                            onChange={(e) => {
                                                                setConversionOptions(
                                                                    conversionOptions.map((opt) =>
                                                                        opt.id === option.id
                                                                            ? { ...opt, label: e.target.value }
                                                                            : opt
                                                                    )
                                                                );
                                                            }}
                                                            className="h-7 flex-1 text-xs"
                                                        />
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            className="h-7 w-7 p-0"
                                                            onClick={() => {
                                                                setConversionOptions(
                                                                    conversionOptions.filter(
                                                                        (opt) => opt.id !== option.id
                                                                    )
                                                                );
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
                                                    setConversionOptions([
                                                        ...conversionOptions,
                                                        {
                                                            id: generateOptionId(),
                                                            label: `Option ${conversionOptions.length + 1}`,
                                                            color: getRandomOptionColor(),
                                                        },
                                                    ]);
                                                }}
                                            >
                                                <Plus className="h-3 w-3 mr-1" />
                                                {t("bitable.actions.add")}
                                            </Button>
                                        </div>
                                    )}

                                    <Button
                                        size="sm"
                                        className="w-full"
                                        disabled={conversionTargetType === localType}
                                        onClick={() => {
                                            if (onConvertFieldType) {
                                                const options =
                                                    conversionTargetType === FieldType.SELECT ||
                                                    conversionTargetType === FieldType.MULTI_SELECT
                                                        ? conversionOptions
                                                        : undefined;
                                                onConvertFieldType(conversionTargetType, options);
                                                setShowTypeConversion(false);
                                                setIsOpen(false);
                                            }
                                        }}
                                    >
                                        <RefreshCw className="h-3 w-3 mr-2" />
                                        {t("bitable.fieldConfig.convertButton")}
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
                        {t("bitable.fieldConfig.deleteField")}
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    );
};
