import React, { useMemo, useCallback, useState } from "react";
import { Card, CardContent } from "@kn/ui";
import { Button, Badge, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@kn/ui";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuLabel,
} from "@kn/ui";
import { Plus, MoreHorizontal, Pencil, Trash2, Check, X } from "@kn/icon";
import { useTranslation } from "@kn/common";
import { FieldConfig, RecordData, ViewConfig, SelectOption } from "../../types";
import { getFieldRenderer } from "../fields/FieldRenderers";
import { buildKanbanColumns, isKanbanGroupable, valueForColumnKey, KANBAN_UNASSIGNED } from "../../utils/kanbanGroups";
import { OPTION_COLORS } from "../../utils/colors";
import { DropdownMenuTrigger } from "@kn/ui";
import {
    KanbanDndProvider,
    DraggableCard,
    DroppableColumn,
    type KanbanDragItem
} from "../components/kanban/dnd";

interface KanbanViewProps {
    view: ViewConfig;
    fields: FieldConfig[];
    data: RecordData[];
    onAddRecord: () => void;
    onUpdateRecord: (recordId: string, updates: Partial<RecordData>) => void;
    onDeleteRecord: (recordIds: string[]) => void;
    onUpdateField: (fieldId: string, updates: Partial<FieldConfig>) => void;
    onUpdateView: (viewId: string, updates: Partial<ViewConfig>) => void;
    editable: boolean;
    onRecordClick?: (record: RecordData) => void;
}

export const KanbanView: React.FC<KanbanViewProps> = (props) => {
    const { view, fields, data, onAddRecord, onUpdateRecord, onDeleteRecord, onUpdateField, onUpdateView, editable, onRecordClick } = props;
    const { t } = useTranslation();

    const groupByField = fields.find(f => f.id === view.kanbanConfig?.groupByField);

    // 可作为看板分组的字段
    const groupableFields = useMemo(() => fields.filter(f => isKanbanGroupable(f.type)), [fields]);

    const setGroupByField = useCallback((fieldId: string) => {
        onUpdateView(view.id, {
            kanbanConfig: { ...view.kanbanConfig, groupByField: fieldId },
        });
    }, [onUpdateView, view.id, view.kanbanConfig]);

    // 看板列（select 分组）的重命名/调色/删除
    const [editingColumnKey, setEditingColumnKey] = useState<string | null>(null);
    const [editingColumnName, setEditingColumnName] = useState('');

    const updateOption = useCallback((optionId: string, patch: Partial<SelectOption>) => {
        if (!groupByField) return;
        const newOptions = (groupByField.options || []).map((o: SelectOption) => o.id === optionId ? { ...o, ...patch } : o);
        onUpdateField(groupByField.id, { options: newOptions });
    }, [groupByField, onUpdateField]);

    const deleteOption = useCallback((optionId: string) => {
        if (!groupByField) return;
        const newOptions = (groupByField.options || []).filter((o: SelectOption) => o.id !== optionId);
        onUpdateField(groupByField.id, { options: newOptions });
    }, [groupByField, onUpdateField]);

    const saveColumnName = useCallback(() => {
        if (editingColumnKey && editingColumnName.trim()) {
            updateOption(editingColumnKey, { label: editingColumnName.trim() });
        }
        setEditingColumnKey(null);
        setEditingColumnName('');
    }, [editingColumnKey, editingColumnName, updateOption]);

    // Handle card drop to change status (works for any groupable field type)
    const handleCardDrop = useCallback((item: KanbanDragItem, targetColumnId: string) => {
        if (!groupByField) return;
        onUpdateRecord(item.record.id, {
            [groupByField.id]: valueForColumnKey(groupByField, targetColumnId),
        });
    }, [groupByField, onUpdateRecord]);

    // 分组数据：支持 select / checkbox / text / number / date / rating 等多种字段
    const columns = useMemo(() => {
        if (!groupByField || !isKanbanGroupable(groupByField.type)) return [];
        return buildKanbanColumns(
            groupByField,
            data,
            {
                uncategorized: t('bitable.kanbanView.uncategorized'),
                yes: t('bitable.kanbanView.yes'),
                no: t('bitable.kanbanView.no'),
            },
            view.kanbanConfig?.showEmptyColumns !== false,
        );
    }, [groupByField, data, t, view.kanbanConfig?.showEmptyColumns]);

    const toolbar = editable && (
        <div className="flex items-center gap-2 px-2 py-2 flex-wrap">
            <Label className="text-xs text-muted-foreground">{t('bitable.kanbanView.groupBy')}</Label>
            <Select value={groupByField?.id || ''} onValueChange={setGroupByField}>
                <SelectTrigger className="h-8 w-44">
                    <SelectValue placeholder={t('bitable.kanbanView.selectGroupField')} />
                </SelectTrigger>
                <SelectContent>
                    {groupableFields.map(f => (
                        <SelectItem key={f.id} value={f.id}>{f.title}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );

    if (!groupByField || !isKanbanGroupable(groupByField.type)) {
        return (
            <div>
                {toolbar}
                <div className="text-center py-8 text-muted-foreground">
                    {!groupByField ? t('bitable.kanbanView.configureGroupField') : t('bitable.kanbanView.notGroupableType')}
                </div>
            </div>
        );
    }

    // 卡片显示的字段：优先用 kanbanConfig.displayFields，否则取前 4 个可见字段
    const cardFields = useMemo(() => {
        const displayIds = view.kanbanConfig?.displayFields;
        const visible = fields.filter(f => f.isShow !== false && f.id !== groupByField?.id);
        if (displayIds && displayIds.length > 0) {
            const byId = new Map(visible.map(f => [f.id, f]));
            return displayIds.map(id => byId.get(id)).filter((f): f is FieldConfig => !!f);
        }
        return visible.slice(0, 4);
    }, [fields, groupByField?.id, view.kanbanConfig?.displayFields]);

    // Render card content
    const renderCardContent = (record: RecordData) => (
        <Card className="hover:shadow-md transition-shadow bg-background cursor-pointer" onClick={() => onRecordClick?.(record)}>
            <CardContent className="p-3 space-y-2">
                {cardFields
                    .map(field => {
                        const Renderer = getFieldRenderer(field.type);
                        return (
                            <div key={field.id} className="text-sm">
                                <div className="text-muted-foreground text-xs mb-1">{field.title}</div>
                                <Renderer value={record[field.id]} field={field} />
                            </div>
                        );
                    })}
            </CardContent>
        </Card>
    );

    return (
        <KanbanDndProvider>
            {toolbar}
            <div className="flex gap-4 overflow-x-auto pb-4">
                {columns.map(column => (
                    <div key={column.key} className="flex-shrink-0 w-72 md:w-80">
                        <DroppableColumn
                            columnId={column.key}
                            onDrop={handleCardDrop}
                            disabled={!editable}
                        >
                            <div className="bg-muted/50 rounded-lg p-3">
                                <div className="flex items-center justify-between mb-3 gap-1">
                                    {editingColumnKey === column.key ? (
                                        <div className="flex items-center gap-1 flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
                                            <Input
                                                value={editingColumnName}
                                                onChange={(e) => setEditingColumnName(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') saveColumnName();
                                                    else if (e.key === 'Escape') { setEditingColumnKey(null); setEditingColumnName(''); }
                                                }}
                                                onBlur={saveColumnName}
                                                autoFocus
                                                className="h-7 text-sm"
                                            />
                                            <Button size="icon" variant="ghost" className="h-6 w-6 flex-shrink-0" onClick={saveColumnName}>
                                                <Check className="h-3.5 w-3.5" />
                                            </Button>
                                            <Button size="icon" variant="ghost" className="h-6 w-6 flex-shrink-0" onClick={() => { setEditingColumnKey(null); setEditingColumnName(''); }}>
                                                <X className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="flex items-center gap-2 min-w-0">
                                                <Badge variant="outline" className="truncate" style={{ borderColor: column.color }}>
                                                    {column.label}
                                                </Badge>
                                                <span className="text-sm text-muted-foreground flex-shrink-0">{column.records.length}</span>
                                            </div>
                                            <div className="flex items-center flex-shrink-0">
                                                {editable && groupByField?.type === 'select' && column.key !== KANBAN_UNASSIGNED && (
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button size="icon" variant="ghost" className="h-7 w-7">
                                                                <MoreHorizontal className="h-4 w-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuItem onClick={() => { setEditingColumnKey(column.key); setEditingColumnName(column.label); }}>
                                                                <Pencil className="h-4 w-4 mr-2" />
                                                                {t('bitable.kanbanView.renameGroup')}
                                                            </DropdownMenuItem>
                                                            <DropdownMenuLabel className="text-xs text-muted-foreground">{t('bitable.kanbanView.color')}</DropdownMenuLabel>
                                                            <div className="flex flex-wrap gap-1.5 px-2 py-1.5">
                                                                {OPTION_COLORS.map(c => (
                                                                    <button
                                                                        key={c}
                                                                        className="h-5 w-5 rounded-full border border-border hover:scale-110 transition-transform"
                                                                        style={{ backgroundColor: c }}
                                                                        onClick={() => updateOption(column.key, { color: c })}
                                                                    />
                                                                ))}
                                                            </div>
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem className="text-red-600 dark:text-red-400" onClick={() => deleteOption(column.key)}>
                                                                <Trash2 className="h-4 w-4 mr-2" />
                                                                {t('bitable.kanbanView.deleteGroup')}
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                )}
                                                {editable && (
                                                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onAddRecord()}>
                                                        <Plus className="h-4 w-4" />
                                                    </Button>
                                                )}
                                            </div>
                                        </>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    {column.records.map(record => (
                                        <DraggableCard
                                            key={record.id}
                                            record={record}
                                            columnId={column.key}
                                            disabled={!editable}
                                        >
                                            {renderCardContent(record)}
                                        </DraggableCard>
                                    ))}
                                </div>
                            </div>
                        </DroppableColumn>
                    </div>
                ))}
            </div>
        </KanbanDndProvider>
    );
};
