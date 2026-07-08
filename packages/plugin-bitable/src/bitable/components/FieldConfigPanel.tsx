/**
 * Field configuration panel — main shell.
 * Uses react-dnd (replaces react-beautiful-dnd) for field reordering.
 * Sub-components: FieldConfigItem, FieldTypeSelector, FieldPropertyForm, FieldTypeConfig.
 */
import React, { useState, useEffect } from "react";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { useTranslation } from "@kn/common";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    Button,
    Input,
    Label,
    Separator,
} from "@kn/ui";
import { Plus } from "@kn/icon";
import { FieldConfig, FieldType, SelectOption } from "../../types";
import { generateFieldId } from "../../utils/id";
import { FieldConfigItem } from "./field-config";
import { FieldTypeSelector, FieldTypeConfig } from "./field-config";

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

/** Get default format string for a field type. */
function getDefaultFormat(type: FieldType): string {
    switch (type) {
        case FieldType.NUMBER: return "number";
        case FieldType.DATE: return "yyyy-MM-dd";
        case FieldType.TEXT: return "single";
        case FieldType.LONG_TEXT: return "";
        case FieldType.RATING: return "5";
        case FieldType.PROGRESS: return "bar";
        case FieldType.URL:
        case FieldType.EMAIL:
        case FieldType.PHONE: return "sameTab";
        case FieldType.IMAGE: return "multiple:medium";
        case FieldType.PERSON: return "single";
        case FieldType.ATTACHMENT: return "multiple";
        default: return "";
    }
}

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
    const [showAddField, setShowAddField] = useState(false);
    const [newFieldTitle, setNewFieldTitle] = useState("");
    const [newFieldType, setNewFieldType] = useState<FieldType>(FieldType.TEXT);
    const [newFieldOptions, setNewFieldOptions] = useState<SelectOption[]>([
        { id: "1", label: t("bitable.defaultOptions.option1"), color: "#3b82f6" },
        { id: "2", label: t("bitable.defaultOptions.option2"), color: "#10b981" },
        { id: "3", label: t("bitable.defaultOptions.option3"), color: "#f59e0b" },
    ]);
    const [newFieldFormat, setNewFieldFormat] = useState<string>("");

    // Update default format when type changes
    useEffect(() => {
        setNewFieldFormat(getDefaultFormat(newFieldType));
    }, [newFieldType]);

    const resetNewFieldForm = () => {
        setNewFieldTitle("");
        setNewFieldType(FieldType.TEXT);
        setNewFieldOptions([
            { id: "1", label: t("bitable.defaultOptions.option1"), color: "#3b82f6" },
            { id: "2", label: t("bitable.defaultOptions.option2"), color: "#10b981" },
            { id: "3", label: t("bitable.defaultOptions.option3"), color: "#f59e0b" },
        ]);
        setNewFieldFormat("");
        setShowAddField(false);
    };

    // react-dnd hover-based reorder
    const handleReorder = (dragIndex: number, hoverIndex: number) => {
        const items = Array.from(fields);
        const [reorderedItem] = items.splice(dragIndex, 1);
        if (!reorderedItem) return;
        items.splice(hoverIndex, 0, reorderedItem);
        onReorderFields(items);
    };

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
        if (newFieldType === FieldType.SELECT || newFieldType === FieldType.MULTI_SELECT) {
            newField.options = newFieldOptions;
        }
        onAddField(newField);
        resetNewFieldForm();
    };

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="w-full md:w-[540px] overflow-y-auto">
                <SheetHeader>
                    <SheetTitle>{t("bitable.fieldConfig.title")}</SheetTitle>
                    <SheetDescription>
                        {t("bitable.fieldConfig.description")}
                    </SheetDescription>
                </SheetHeader>

                <div className="mt-6 space-y-4">
                    {/* Field list header */}
                    <div className="flex items-center justify-between mb-3">
                        <Label className="text-sm font-semibold">
                            {t("bitable.fieldConfig.fieldList")}
                        </Label>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setShowAddField(!showAddField)}
                        >
                            <Plus className="h-4 w-4 mr-1" />
                            {t("bitable.fieldConfig.addField")}
                        </Button>
                    </div>

                    {/* Add field form */}
                    {showAddField && (
                        <div className="mb-4 p-3 border rounded-lg bg-muted/30 space-y-3">
                            <div>
                                <Label htmlFor="newFieldTitle" className="text-xs">
                                    {t("bitable.fieldConfig.fieldName")}
                                </Label>
                                <Input
                                    id="newFieldTitle"
                                    value={newFieldTitle}
                                    onChange={(e) => setNewFieldTitle(e.target.value)}
                                    placeholder={t("bitable.fieldConfig.fieldNamePlaceholder")}
                                    className="h-8 mt-1"
                                    autoFocus
                                />
                            </div>
                            <div>
                                <Label className="text-xs">
                                    {t("bitable.fieldConfig.fieldType")}
                                </Label>
                                <div className="mt-1">
                                    <FieldTypeSelector
                                        value={newFieldType}
                                        onChange={(type) => setNewFieldType(type)}
                                        disabledTypes={[FieldType.ID]}
                                    />
                                </div>
                            </div>

                            {/* Type-specific config */}
                            <FieldTypeConfig
                                type={newFieldType}
                                format={newFieldFormat}
                                options={newFieldOptions}
                                onFormatChange={setNewFieldFormat}
                                onOptionsChange={setNewFieldOptions}
                                t={t}
                                labelIdPrefix="newFieldFormat"
                            />

                            <div className="flex gap-2 pt-2">
                                <Button
                                    size="sm"
                                    onClick={handleAddNewField}
                                    disabled={!newFieldTitle.trim()}
                                    className="flex-1"
                                >
                                    {t("bitable.fieldConfig.confirmAdd")}
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={resetNewFieldForm}
                                >
                                    {t("bitable.actions.cancel")}
                                </Button>
                            </div>
                        </div>
                    )}

                    <Separator className="my-3" />

                    {/* Draggable field list */}
                    <DndProvider backend={HTML5Backend}>
                        <div className="bitable-field-config__list">
                            {fields.map((field, index) => (
                                <FieldConfigItem
                                    key={field.id}
                                    field={field}
                                    index={index}
                                    onUpdateField={onUpdateField}
                                    onDeleteField={onDeleteField}
                                    onConvertFieldType={onConvertFieldType}
                                    onReorder={handleReorder}
                                />
                            ))}
                        </div>
                    </DndProvider>

                    {/* Tips */}
                    <div className="mt-6 p-3 bg-muted/50 rounded-lg">
                        <p className="text-xs text-muted-foreground">
                            💡 {t("bitable.tips.title")}：
                        </p>
                        <ul className="text-xs text-muted-foreground mt-2 space-y-1">
                            <li>• {t("bitable.tips.dragToReorder")}</li>
                            <li>• {t("bitable.tips.clickEyeToToggle")}</li>
                            <li>• {t("bitable.tips.clickFieldToConfigure")}</li>
                            <li>• {t("bitable.tips.idFieldLocked")}</li>
                        </ul>
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
};
