import React from "react";
import {
    Popover, PopoverContent, PopoverTrigger,
    Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Input,
} from "@kn/ui";
import { Filter, Plus, Trash2 } from "@kn/icon";
import { useTranslation } from "@kn/common";
import { FieldConfig, FilterConfig, FilterOperator, ViewConfig, FieldType } from "../../types";
import { generateRecordId } from "../../utils/id";

interface FilterPanelProps {
    view: ViewConfig;
    fields: FieldConfig[];
    onUpdateView: (viewId: string, updates: Partial<ViewConfig>) => void;
}

const getOperatorsForFieldType = (type: FieldType): FilterOperator[] => {
    switch (type) {
        case FieldType.NUMBER:
        case FieldType.PROGRESS:
        case FieldType.RATING:
            return [
                FilterOperator.EQUALS, FilterOperator.NOT_EQUALS,
                FilterOperator.GREATER_THAN, FilterOperator.LESS_THAN,
                FilterOperator.GREATER_THAN_OR_EQUAL, FilterOperator.LESS_THAN_OR_EQUAL,
                FilterOperator.IS_EMPTY, FilterOperator.IS_NOT_EMPTY,
            ];
        case FieldType.CHECKBOX:
            return [FilterOperator.EQUALS, FilterOperator.NOT_EQUALS];
        case FieldType.SELECT:
        case FieldType.MULTI_SELECT:
            return [
                FilterOperator.EQUALS, FilterOperator.NOT_EQUALS,
                FilterOperator.IS_EMPTY, FilterOperator.IS_NOT_EMPTY,
            ];
        default:
            return [
                FilterOperator.CONTAINS, FilterOperator.NOT_CONTAINS,
                FilterOperator.EQUALS, FilterOperator.NOT_EQUALS,
                FilterOperator.IS_EMPTY, FilterOperator.IS_NOT_EMPTY,
            ];
    }
};

const OPERATOR_LABELS: Record<FilterOperator, string> = {
    [FilterOperator.EQUALS]: '=',
    [FilterOperator.NOT_EQUALS]: '≠',
    [FilterOperator.CONTAINS]: '∋',
    [FilterOperator.NOT_CONTAINS]: '∌',
    [FilterOperator.IS_EMPTY]: 'empty',
    [FilterOperator.IS_NOT_EMPTY]: '!empty',
    [FilterOperator.GREATER_THAN]: '>',
    [FilterOperator.LESS_THAN]: '<',
    [FilterOperator.GREATER_THAN_OR_EQUAL]: '≥',
    [FilterOperator.LESS_THAN_OR_EQUAL]: '≤',
    [FilterOperator.IS_ANY_OF]: 'any of',
    [FilterOperator.IS_NONE_OF]: 'none of',
};

const needsValue = (op: FilterOperator) =>
    op !== FilterOperator.IS_EMPTY && op !== FilterOperator.IS_NOT_EMPTY;

export const FilterPanel: React.FC<FilterPanelProps> = ({ view, fields, onUpdateView }) => {
    const { t } = useTranslation();
    const filters = view.filters || [];
    const hasFilters = filters.length > 0;

    const addFilter = () => {
        const firstField = fields.find(f => f.type !== 'id') || fields[0];
        if (!firstField) return;
        const operators = getOperatorsForFieldType(firstField.type);
        const newFilter: FilterConfig = {
            id: generateRecordId(),
            fieldId: firstField.id,
            operator: operators[0],
            value: '',
        };
        onUpdateView(view.id, { filters: [...filters, newFilter] });
    };

    const updateFilter = (filterId: string, updates: Partial<FilterConfig>) => {
        const newFilters = filters.map(f => f.id === filterId ? { ...f, ...updates } : f);
        onUpdateView(view.id, { filters: newFilters });
    };

    const removeFilter = (filterId: string) => {
        onUpdateView(view.id, { filters: filters.filter(f => f.id !== filterId) });
    };

    return (
        <Popover>
            <PopoverTrigger asChild>
                <button
                    className={`bitable-toolbar__action${hasFilters ? ' bitable-toolbar__action--active' : ''}`}
                    title={t('bitable.filter.title', 'Filter')}
                >
                    <Filter className="h-4 w-4" />
                </button>
            </PopoverTrigger>
            <PopoverContent className="w-[calc(100vw-1.5rem)] max-w-96 p-3" align="start">
                <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium">Filter</div>
                        {filters.length > 1 && (
                            <Select
                                value={view.filterLogic || 'and'}
                                onValueChange={(v: 'and' | 'or') => onUpdateView(view.id, { filterLogic: v })}
                            >
                                <SelectTrigger className="h-7 w-36 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="and">{t('bitable.filter.matchAll', 'Match all (AND)')}</SelectItem>
                                    <SelectItem value="or">{t('bitable.filter.matchAny', 'Match any (OR)')}</SelectItem>
                                </SelectContent>
                            </Select>
                        )}
                    </div>
                    {filters.map(filter => {
                        const field = fields.find(f => f.id === filter.fieldId);
                        const operators = field ? getOperatorsForFieldType(field.type) : [];
                        return (
                            <div key={filter.id} className="flex items-center gap-1.5">
                                <Select
                                    value={filter.fieldId}
                                    onValueChange={(v) => {
                                        const newField = fields.find(f => f.id === v);
                                        const newOps = newField ? getOperatorsForFieldType(newField.type) : [];
                                        updateFilter(filter.id, {
                                            fieldId: v,
                                            operator: newOps[0] || FilterOperator.EQUALS,
                                            value: '',
                                        });
                                    }}
                                >
                                    <SelectTrigger className="h-8 w-28">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {fields.filter(f => f.type !== 'id').map(f => (
                                            <SelectItem key={f.id} value={f.id}>{f.title}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Select
                                    value={filter.operator}
                                    onValueChange={(v: FilterOperator) => updateFilter(filter.id, { operator: v })}
                                >
                                    <SelectTrigger className="h-8 w-20">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {operators.map(op => (
                                            <SelectItem key={op} value={op}>{OPERATOR_LABELS[op]}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {needsValue(filter.operator) && (
                                    <Input
                                        value={filter.value || ''}
                                        onChange={(e) => updateFilter(filter.id, { value: e.target.value })}
                                        className="h-8 flex-1"
                                        placeholder="Value"
                                    />
                                )}
                                <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => removeFilter(filter.id)}>
                                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                </Button>
                            </div>
                        );
                    })}
                    <Button size="sm" variant="outline" className="w-full" onClick={addFilter}>
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        {t('bitable.actions.add')}
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    );
};
