import React, { useState } from "react";
import { generateOptionId } from "../../utils/id";
import { getRandomOptionColor } from "../../utils/colors";
import { useTranslation } from "@kn/common";
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
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
import { Plus, Trash2, Settings2 } from "@kn/icon";
import { FieldConfig, FieldType, SelectOption } from "../../types";

interface FieldPropertiesEditorProps {
    field: FieldConfig;
    onUpdateField: (updates: Partial<FieldConfig>) => void;
}

/**
 * Component for editing field-specific properties
 * Different field types have different configurable properties
 */
export const FieldPropertiesEditor: React.FC<FieldPropertiesEditorProps> = ({
    field,
    onUpdateField,
}) => {
    const { t } = useTranslation();
    const [newOptionLabel, setNewOptionLabel] = useState("");

    // Render properties based on field type
    const renderFieldSpecificProperties = () => {
        switch (field.type) {
            case FieldType.SELECT:
            case FieldType.MULTI_SELECT:
                return renderSelectProperties();
            case FieldType.NUMBER:
                return renderNumberProperties();
            case FieldType.DATE:
                return renderDateProperties();
            case FieldType.TEXT:
                return renderTextProperties();
            case FieldType.RATING:
                return renderRatingProperties();
            case FieldType.PROGRESS:
                return renderProgressProperties();
            case FieldType.URL:
            case FieldType.EMAIL:
            case FieldType.PHONE:
                return renderLinkProperties();
            default:
                return renderCommonProperties();
        }
    };

    // Select/Multi-select field properties
    const renderSelectProperties = () => {
        const options = (field.options as SelectOption[]) || [];

        const addOption = () => {
            if (!newOptionLabel.trim()) return;

            const newOption: SelectOption = {
                id: generateOptionId(),
                label: newOptionLabel.trim(),
                color: getRandomOptionColor(),
            };

            onUpdateField({
                options: [...options, newOption],
            });
            setNewOptionLabel("");
        };

        const updateOption = (optionId: string, updates: Partial<SelectOption>) => {
            const updatedOptions = options.map((opt) =>
                opt.id === optionId ? { ...opt, ...updates } : opt
            );
            onUpdateField({ options: updatedOptions });
        };

        const deleteOption = (optionId: string) => {
            const updatedOptions = options.filter((opt) => opt.id !== optionId);
            onUpdateField({ options: updatedOptions });
        };

        return (
            <div className="space-y-3">
                <div>
                    <Label className="text-xs font-semibold">{t('bitable.formats.optionsList')}</Label>
                    <div className="mt-2 space-y-2">
                        {options.map((option) => (
                            <div key={option.id} className="flex items-center gap-2">
                                <div
                                    className="w-4 h-4 rounded"
                                    style={{ backgroundColor: option.color }}
                                />
                                <Input
                                    value={option.label}
                                    onChange={(e) =>
                                        updateOption(option.id, { label: e.target.value })
                                    }
                                    className="h-8 flex-1"
                                />
                                <input
                                    type="color"
                                    value={option.color}
                                    onChange={(e) =>
                                        updateOption(option.id, { color: e.target.value })
                                    }
                                    className="w-8 h-8 rounded border cursor-pointer"
                                />
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => deleteOption(option.id)}
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
                            if (e.key === "Enter") addOption();
                        }}
                    />
                    <Button size="sm" onClick={addOption} disabled={!newOptionLabel.trim()}>
                        <Plus className="h-4 w-4 mr-1" />
                        {t('bitable.actions.add')}
                    </Button>
                </div>
            </div>
        );
    };

    // Number field properties
    const renderNumberProperties = () => {
        return (
            <div className="space-y-3">
                <div>
                    <Label htmlFor="format" className="text-xs">
                        {t('bitable.formats.numberFormat')}
                    </Label>
                    <Select
                        value={field.format || "number"}
                        onValueChange={(value) => onUpdateField({ format: value })}
                    >
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
            </div>
        );
    };

    // Date field properties
    const renderDateProperties = () => {
        return (
            <div className="space-y-3">
                <div>
                    <Label htmlFor="dateFormat" className="text-xs">
                        {t('bitable.formats.dateFormat')}
                    </Label>
                    <Select
                        value={field.format || "yyyy-MM-dd"}
                        onValueChange={(value) => onUpdateField({ format: value })}
                    >
                        <SelectTrigger className="h-8 mt-1">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="yyyy-MM-dd">2024-01-15</SelectItem>
                            <SelectItem value="yyyy/MM/dd">2024/01/15</SelectItem>
                            <SelectItem value="MM-dd-yyyy">01-15-2024</SelectItem>
                            <SelectItem value="dd/MM/yyyy">15/01/2024</SelectItem>
                            <SelectItem value="yyyy-MM-dd HH:mm">2024-01-15 14:30</SelectItem>
                            <SelectItem value="yyyy-MM-dd HH:mm:ss">
                                2024-01-15 14:30:00
                            </SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>
        );
    };

    // Text field properties
    const renderTextProperties = () => {
        return (
            <div className="space-y-3">
                <div>
                    <Label htmlFor="textFormat" className="text-xs">
                        {t('bitable.formats.textType')}
                    </Label>
                    <Select
                        value={field.format || "single"}
                        onValueChange={(value) => onUpdateField({ format: value })}
                    >
                        <SelectTrigger className="h-8 mt-1">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="single">{t('bitable.formats.singleLine')}</SelectItem>
                            <SelectItem value="multi">{t('bitable.formats.multiLine')}</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>
        );
    };

    // Rating field properties
    const renderRatingProperties = () => {
        return (
            <div className="space-y-3">
                <div>
                    <Label htmlFor="maxRating" className="text-xs">
                        {t('bitable.formats.maxRating')}
                    </Label>
                    <Select
                        value={field.format || "5"}
                        onValueChange={(value) => onUpdateField({ format: value })}
                    >
                        <SelectTrigger className="h-8 mt-1">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="5">{t('bitable.formats.stars5')}</SelectItem>
                            <SelectItem value="10">{t('bitable.formats.stars10')}</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>
        );
    };

    // Progress field properties
    const renderProgressProperties = () => {
        return (
            <div className="space-y-3">
                <div>
                    <Label htmlFor="progressFormat" className="text-xs">
                        {t('bitable.formats.progressDisplay')}
                    </Label>
                    <Select
                        value={field.format || "bar"}
                        onValueChange={(value) => onUpdateField({ format: value })}
                    >
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
            </div>
        );
    };

    // Link/URL/Email/Phone properties
    const renderLinkProperties = () => {
        return (
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <Label htmlFor="openInNewTab" className="text-xs">
                        {t('bitable.formats.newTabOpen')}
                    </Label>
                    <Switch
                        id="openInNewTab"
                        checked={field.format === "newTab"}
                        onCheckedChange={(checked) =>
                            onUpdateField({ format: checked ? "newTab" : "sameTab" })
                        }
                    />
                </div>
            </div>
        );
    };

    // Common properties for all fields
    const renderCommonProperties = () => {
        return (
            <div className="space-y-3">
                <div>
                    <Label htmlFor="description" className="text-xs">
                        {t('bitable.fieldConfig.fieldDescription')}
                    </Label>
                    <Textarea
                        id="description"
                        value={field.description || ""}
                        onChange={(e) => onUpdateField({ description: e.target.value })}
                        placeholder={t('bitable.fieldConfig.fieldDescriptionPlaceholder')}
                        className="mt-1 min-h-[60px]"
                    />
                </div>
            </div>
        );
    };

    return (
        <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="properties">
                <AccordionTrigger className="text-xs font-semibold py-2">
                    <div className="flex items-center gap-2">
                        <Settings2 className="h-3 w-3" />
                        {t('bitable.fieldConfig.fieldProperties')}
                    </div>
                </AccordionTrigger>
                <AccordionContent>
                    <div className="space-y-4 pt-2">
                        {/* Type-specific properties */}
                        {renderFieldSpecificProperties()}

                        <Separator />

                        {/* Common properties */}
                        <div>
                            <Label htmlFor="width" className="text-xs">
                                {t('bitable.fieldConfig.columnWidth')}
                            </Label>
                            <Input
                                id="width"
                                type="number"
                                value={field.width || 150}
                                onChange={(e) =>
                                    onUpdateField({ width: parseInt(e.target.value) || 150 })
                                }
                                className="h-8 mt-1"
                                min={80}
                                max={500}
                            />
                        </div>

                        <div>
                            <Label htmlFor="description" className="text-xs">
                                {t('bitable.fieldConfig.fieldDescription')}
                            </Label>
                            <Textarea
                                id="description"
                                value={field.description || ""}
                                onChange={(e) => onUpdateField({ description: e.target.value })}
                                placeholder={t('bitable.fieldConfig.fieldDescriptionPlaceholder')}
                                className="mt-1 min-h-[60px]"
                            />
                        </div>
                    </div>
                </AccordionContent>
            </AccordionItem>
        </Accordion>
    );
};
