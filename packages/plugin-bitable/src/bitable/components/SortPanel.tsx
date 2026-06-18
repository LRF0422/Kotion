import React from "react";
import {
    Popover, PopoverContent, PopoverTrigger,
    Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@kn/ui";
import { ArrowUpDown, Plus, Trash2 } from "@kn/icon";
import { useTranslation } from "@kn/common";
import { FieldConfig, SortConfig, ViewConfig } from "../../types";
import { generateRecordId } from "../../utils/id";

interface SortPanelProps {
    view: ViewConfig;
    fields: FieldConfig[];
    onUpdateView: (viewId: string, updates: Partial<ViewConfig>) => void;
}

export const SortPanel: React.FC<SortPanelProps> = ({ view, fields, onUpdateView }) => {
    const { t } = useTranslation();
    const sorts = view.sorts || [];
    const hasSorts = sorts.length > 0;

    const addSort = () => {
        const firstAvailable = fields.find(f => f.type !== 'id' && !sorts.some(s => s.fieldId === f.id));
        if (!firstAvailable) return;
        const newSort: SortConfig = {
            id: generateRecordId(),
            fieldId: firstAvailable.id,
            direction: 'asc',
        };
        onUpdateView(view.id, { sorts: [...sorts, newSort] });
    };

    const updateSort = (sortId: string, updates: Partial<SortConfig>) => {
        const newSorts = sorts.map(s => s.id === sortId ? { ...s, ...updates } : s);
        onUpdateView(view.id, { sorts: newSorts });
    };

    const removeSort = (sortId: string) => {
        onUpdateView(view.id, { sorts: sorts.filter(s => s.id !== sortId) });
    };

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    size="icon"
                    variant="ghost"
                    className="h-9 w-9 md:h-8 md:w-8 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-accent relative"
                >
                    <ArrowUpDown className="h-4 w-4" />
                    {hasSorts && (
                        <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-blue-500 rounded-full" />
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[calc(100vw-1.5rem)] max-w-80 p-3" align="start">
                <div className="space-y-2">
                    <div className="text-sm font-medium">{t('bitable.chartView.sortOrder')}</div>
                    {sorts.map(sort => (
                        <div key={sort.id} className="flex items-center gap-2">
                            <Select
                                value={sort.fieldId}
                                onValueChange={(v) => updateSort(sort.id, { fieldId: v })}
                            >
                                <SelectTrigger className="h-8 flex-1">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {fields.filter(f => f.type !== 'id').map(f => (
                                        <SelectItem key={f.id} value={f.id}>{f.title}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Select
                                value={sort.direction}
                                onValueChange={(v: 'asc' | 'desc') => updateSort(sort.id, { direction: v })}
                            >
                                <SelectTrigger className="h-8 w-24">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="asc">{t('bitable.chartView.sortAsc')}</SelectItem>
                                    <SelectItem value="desc">{t('bitable.chartView.sortDesc')}</SelectItem>
                                </SelectContent>
                            </Select>
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => removeSort(sort.id)}>
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                        </div>
                    ))}
                    <Button size="sm" variant="outline" className="w-full" onClick={addSort}>
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        {t('bitable.actions.add')}
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    );
};
