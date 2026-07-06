import React from "react";
import {
    Popover, PopoverContent, PopoverTrigger,
    Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@kn/ui";
import { Rows3, Plus, Trash2 } from "@kn/icon";
import { useTranslation } from "@kn/common";
import { FieldConfig, GroupConfig, ViewConfig, FieldType } from "../../types";

interface GroupPanelProps {
    view: ViewConfig;
    fields: FieldConfig[];
    onUpdateView: (viewId: string, updates: Partial<ViewConfig>) => void;
}

// Field types that support grouping
const GROUPABLE_FIELD_TYPES: FieldType[] = [
    FieldType.SELECT,
    FieldType.MULTI_SELECT,
    FieldType.CHECKBOX,
    FieldType.TEXT,
    FieldType.NUMBER,
    FieldType.DATE,
    FieldType.PERSON,
    FieldType.URL,
    FieldType.EMAIL,
    FieldType.RATING,
    FieldType.PROGRESS,
];

export const GroupPanel: React.FC<GroupPanelProps> = ({ view, fields, onUpdateView }) => {
    const { t } = useTranslation();
    const groups = view.groups || [];
    const hasGroups = groups.length > 0;

    const groupableFields = fields.filter(f =>
        f.type !== 'id' && GROUPABLE_FIELD_TYPES.includes(f.type)
    );

    const addGroup = () => {
        const firstAvailable = groupableFields.find(f => !groups.some(g => g.fieldId === f.id));
        if (!firstAvailable) return;
        const newGroup: GroupConfig = {
            fieldId: firstAvailable.id,
            order: 'asc',
        };
        onUpdateView(view.id, { groups: [...groups, newGroup] });
    };

    const updateGroup = (index: number, updates: Partial<GroupConfig>) => {
        const newGroups = groups.map((g, i) => i === index ? { ...g, ...updates } : g);
        onUpdateView(view.id, { groups: newGroups });
    };

    const removeGroup = (index: number) => {
        const newGroups = groups.filter((_, i) => i !== index);
        onUpdateView(view.id, { groups: newGroups });
    };

    return (
        <Popover>
            <PopoverTrigger asChild>
                <button
                    className="bitable-toolbar__action"
                    title={t('bitable.groupPanel.title', 'Group')}
                >
                    <Rows3 className="h-4 w-4" />
                </button>
            </PopoverTrigger>
            <PopoverContent className="w-[calc(100vw-1.5rem)] max-w-80 p-3" align="start">
                <div className="space-y-2">
                    <div className="text-sm font-medium">{t('bitable.groupPanel.title')}</div>
                    {groups.map((group, index) => {
                        const field = fields.find(f => f.id === group.fieldId);
                        return (
                            <div key={index} className="flex items-center gap-2">
                                <Select
                                    value={group.fieldId}
                                    onValueChange={(v) => updateGroup(index, { fieldId: v })}
                                >
                                    <SelectTrigger className="h-8 flex-1">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {groupableFields.map(f => (
                                            <SelectItem key={f.id} value={f.id}>{f.title}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Select
                                    value={group.order || 'asc'}
                                    onValueChange={(v: 'asc' | 'desc') => updateGroup(index, { order: v })}
                                >
                                    <SelectTrigger className="h-8 w-24">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="asc">{t('bitable.chartView.sortAsc')}</SelectItem>
                                        <SelectItem value="desc">{t('bitable.chartView.sortDesc')}</SelectItem>
                                    </SelectContent>
                                </Select>
                                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => removeGroup(index)}>
                                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                </Button>
                            </div>
                        );
                    })}
                    {groups.length === 0 && (
                        <div className="text-xs text-muted-foreground py-1">
                            {t('bitable.groupPanel.emptyHint')}
                        </div>
                    )}
                    <Button size="sm" variant="outline" className="w-full" onClick={addGroup} disabled={groupableFields.length === 0}>
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        {t('bitable.actions.add')}
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    );
};
