import React, { useMemo, useCallback, useState, useEffect } from "react";
import { useTranslation } from "@kn/common";
import { FieldConfig, RecordData, ViewConfig, SelectOption } from "../../../types";
import {
    buildKanbanColumns,
    isKanbanGroupable,
    valueForColumnKey,
    KANBAN_UNASSIGNED,
    type KanbanColumn as KanbanColumnData,
} from "../../../utils/kanbanGroups";
import { KanbanDndProvider } from "./dnd";
import { KanbanToolbar } from "./KanbanToolbar";
import { KanbanColumn } from "./KanbanColumn";

interface KanbanViewProps {
    view: ViewConfig;
    fields: FieldConfig[];
    data: RecordData[];
    onAddRecord: () => void;
    onCreateRecord: (values: Partial<RecordData>) => void;
    onUpdateRecord: (recordId: string, updates: Partial<RecordData>) => void;
    onDeleteRecord: (recordIds: string[]) => void;
    onUpdateField: (fieldId: string, updates: Partial<FieldConfig>) => void;
    onUpdateView: (viewId: string, updates: Partial<ViewConfig>) => void;
    editable: boolean;
    onRecordClick?: (record: RecordData) => void;
}

export const KanbanView: React.FC<KanbanViewProps> = (props) => {
    const {
        view,
        fields,
        data,
        onAddRecord,
        onCreateRecord,
        onUpdateRecord,
        onUpdateField,
        onUpdateView,
        editable,
        onRecordClick,
    } = props;
    const { t } = useTranslation();

    const groupByField = fields.find((f) => f.id === view.kanbanConfig?.groupByField);

    // --- Collapsed column state (local, keyed by column key) ---
    const [collapsedColumns, setCollapsedColumns] = useState<Set<string>>(new Set());
    const toggleCollapse = useCallback((columnKey: string) => {
        setCollapsedColumns((prev) => {
            const next = new Set(prev);
            if (next.has(columnKey)) next.delete(columnKey);
            else next.add(columnKey);
            return next;
        });
    }, []);

    // --- Column order (local state, initialized from config or built order) ---
    const [columnOrder, setColumnOrder] = useState<string[]>([]);
    const columnsRaw = useMemo(() => {
        if (!groupByField || !isKanbanGroupable(groupByField.type)) return [];
        return buildKanbanColumns(
            groupByField,
            data,
            {
                uncategorized: t("bitable.kanbanView.uncategorized"),
                yes: t("bitable.kanbanView.yes"),
                no: t("bitable.kanbanView.no"),
            },
            view.kanbanConfig?.showEmptyColumns !== false
        );
    }, [groupByField, data, t, view.kanbanConfig?.showEmptyColumns]);

    // Sync columnOrder with built columns on first build
    useEffect(() => {
        if (columnOrder.length === 0 && columnsRaw.length > 0) {
            setColumnOrder(columnsRaw.map((c) => c.key));
        }
    }, [columnsRaw, columnOrder.length]);

    // Sort columns by columnOrder
    const columns = useMemo(() => {
        if (columnOrder.length === 0) return columnsRaw;
        const byKey = new Map(columnsRaw.map((c) => [c.key, c]));
        const ordered: KanbanColumnData[] = [];
        for (const key of columnOrder) {
            const col = byKey.get(key);
            if (col) ordered.push(col);
        }
        // Add any new columns not yet in columnOrder
        for (const col of columnsRaw) {
            if (!ordered.includes(col)) ordered.push(col);
        }
        return ordered;
    }, [columnsRaw, columnOrder]);

    const collapseAll = useCallback(() => {
        setCollapsedColumns(new Set(columnsRaw.map((c: KanbanColumnData) => c.key)));
    }, [columnsRaw]);

    // --- Card display fields ---
    const cardFields = useMemo(() => {
        const displayIds = view.kanbanConfig?.displayFields;
        const visible = fields.filter((f) => f.isShow !== false && f.id !== groupByField?.id);
        if (displayIds && displayIds.length > 0) {
            const byId = new Map(visible.map((f) => [f.id, f]));
            return displayIds.map((id) => byId.get(id)).filter((f): f is FieldConfig => !!f);
        }
        return visible.slice(0, 4);
    }, [fields, groupByField?.id, view.kanbanConfig?.displayFields]);

    // --- Card DnD: drop changes the group field value ---
    const handleCardDrop = useCallback(
        (record: RecordData, targetColumnId: string) => {
            if (!groupByField) return;
            onUpdateRecord(record.id, {
                [groupByField.id]: valueForColumnKey(groupByField, targetColumnId),
            });
        },
        [groupByField, onUpdateRecord]
    );

    // --- Column reordering ---
    const handleReorderColumns = useCallback((sourceId: string, targetId: string) => {
        setColumnOrder((prev) => {
            const sourceIdx = prev.indexOf(sourceId);
            const targetIdx = prev.indexOf(targetId);
            if (sourceIdx === -1 || targetIdx === -1 || sourceIdx === targetIdx) return prev;
            const next = [...prev];
            next.splice(sourceIdx, 1);
            next.splice(targetIdx, 0, sourceId);
            return next;
        });
    }, []);

    // --- Option CRUD (for select-type group field) ---
    const updateOption = useCallback(
        (optionId: string, patch: Partial<SelectOption>) => {
            if (!groupByField) return;
            const newOptions = (groupByField.options || []).map((o: SelectOption) =>
                o.id === optionId ? { ...o, ...patch } : o
            );
            onUpdateField(groupByField.id, { options: newOptions });
        },
        [groupByField, onUpdateField]
    );

    const deleteOption = useCallback(
        (optionId: string) => {
            if (!groupByField) return;
            const newOptions = (groupByField.options || []).filter(
                (o: SelectOption) => o.id !== optionId
            );
            onUpdateField(groupByField.id, { options: newOptions });
        },
        [groupByField, onUpdateField]
    );

    // --- Add record to specific column ---
    const handleAddRecordToColumn = useCallback(
        (columnKey: string) => {
            if (!groupByField) {
                onAddRecord();
                return;
            }
            onCreateRecord({
                [groupByField.id]: valueForColumnKey(groupByField, columnKey),
            });
        },
        [groupByField, onAddRecord, onCreateRecord]
    );

    // --- No group field configured ---
    if (!groupByField || !isKanbanGroupable(groupByField.type)) {
        return (
            <div>
                <KanbanToolbar
                    view={view}
                    fields={fields}
                    onUpdateView={onUpdateView}
                    editable={editable}
                />
                <div className="bitable-kanban__placeholder">
                    {!groupByField
                        ? t("bitable.kanbanView.configureGroupField")
                        : t("bitable.kanbanView.notGroupableType")}
                </div>
            </div>
        );
    }

    return (
        <KanbanDndProvider>
            <KanbanToolbar
                view={view}
                fields={fields}
                onUpdateView={onUpdateView}
                editable={editable}
            />
            <div className="bitable-kanban">
                {columns.map((column, idx) => (
                    <KanbanColumn
                        key={column.key}
                        column={column}
                        index={idx}
                        groupByField={groupByField}
                        cardFields={cardFields}
                        editable={editable}
                        collapsed={collapsedColumns.has(column.key)}
                        onToggleCollapse={() => toggleCollapse(column.key)}
                        onCardDrop={handleCardDrop}
                        onReorderColumns={handleReorderColumns}
                        onRenameOption={(optionId, label) => updateOption(optionId, { label })}
                        onChangeColor={(optionId, color) => updateOption(optionId, { color })}
                        onDeleteOption={deleteOption}
                        onAddRecordToColumn={handleAddRecordToColumn}
                        onRecordClick={onRecordClick}
                        onUpdateRecord={onUpdateRecord}
                        onCollapseAll={idx === 0 ? collapseAll : undefined}
                    />
                ))}
            </div>
        </KanbanDndProvider>
    );
};
