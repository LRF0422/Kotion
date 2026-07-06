import React, { useState, useCallback } from "react";
import { Plus } from "@kn/icon";
import { useTranslation } from "@kn/common";
import { FieldConfig, RecordData, SelectOption } from "../../../types";
import type { KanbanColumn as KanbanColumnData } from "../../../utils/kanbanGroups";
import { KANBAN_UNASSIGNED, valueForColumnKey } from "../../../utils/kanbanGroups";
import { DroppableColumn, DraggableColumn } from "./dnd";
import { KanbanColumnHeader } from "./KanbanColumnHeader";
import { KanbanCard } from "./KanbanCard";

interface KanbanColumnProps {
    column: KanbanColumnData;
    index: number;
    groupByField: FieldConfig;
    cardFields: FieldConfig[];
    editable: boolean;
    collapsed: boolean;
    onToggleCollapse: () => void;
    onCardDrop: (record: RecordData, targetColumnId: string) => void;
    onReorderColumns: (sourceId: string, targetId: string) => void;
    onRenameOption: (optionId: string, label: string) => void;
    onChangeColor: (optionId: string, color: string) => void;
    onDeleteOption: (optionId: string) => void;
    onAddRecordToColumn: (columnKey: string) => void;
    onRecordClick?: (record: RecordData) => void;
    onUpdateRecord: (recordId: string, updates: Partial<RecordData>) => void;
    onCollapseAll?: () => void;
}

/**
 * Kanban column: droppable zone with header, card list, quick-add,
 * and empty state.
 */
export const KanbanColumn: React.FC<KanbanColumnProps> = ({
    column,
    index,
    groupByField,
    cardFields,
    editable,
    collapsed,
    onToggleCollapse,
    onCardDrop,
    onReorderColumns,
    onRenameOption,
    onChangeColor,
    onDeleteOption,
    onAddRecordToColumn,
    onRecordClick,
    onUpdateRecord,
    onCollapseAll,
}) => {
    const { t } = useTranslation();
    const [showQuickAdd, setShowQuickAdd] = useState(false);
    const [quickAddValue, setQuickAddValue] = useState("");

    const handleAddCard = useCallback(() => {
        if (quickAddValue.trim()) {
            onAddRecordToColumn(column.key);
            setQuickAddValue("");
        } else {
            onAddRecordToColumn(column.key);
        }
        setShowQuickAdd(false);
    }, [quickAddValue, column.key, onAddRecordToColumn]);

    const handleQuickAddKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === "Enter") {
                handleAddCard();
            } else if (e.key === "Escape") {
                setShowQuickAdd(false);
                setQuickAddValue("");
            }
        },
        [handleAddCard]
    );

    return (
        <DraggableColumn
            columnId={column.key}
            index={index}
            onReorder={onReorderColumns}
            disabled={!editable}
        >
            <div className={`bitable-kanban__column${collapsed ? " bitable-kanban__column--collapsed" : ""}`}>
                <KanbanColumnHeader
                    column={column}
                    groupByField={groupByField}
                    editable={editable}
                    collapsed={collapsed}
                    onToggleCollapse={onToggleCollapse}
                    onRename={onRenameOption}
                    onChangeColor={onChangeColor}
                    onDeleteOption={onDeleteOption}
                    onCollapseAll={onCollapseAll}
                />

                {!collapsed && (
                    <DroppableColumn
                        columnId={column.key}
                        onDrop={(item) => onCardDrop(item.record, column.key)}
                        disabled={!editable}
                    >
                        <div className="bitable-kanban__column-body">
                            <div className="bitable-kanban__cards">
                                {column.records.length === 0 ? (
                                    <div className="bitable-kanban__empty">
                                        <span className="bitable-kanban__empty-text">
                                            {t("bitable.kanbanView.noRecords")}
                                        </span>
                                        {editable && (
                                            <button
                                                className="bitable-kanban__empty-add"
                                                onClick={() => onAddRecordToColumn(column.key)}
                                            >
                                                <Plus style={{ width: 14, height: 14 }} />
                                                {t("bitable.kanbanView.addCard")}
                                            </button>
                                        )}
                                    </div>
                                ) : (
                                    column.records.map((record: RecordData) => (
                                        <KanbanCard
                                            key={record.id}
                                            record={record}
                                            columnId={column.key}
                                            cardFields={cardFields}
                                            editable={editable}
                                            onRecordClick={onRecordClick}
                                            onUpdateRecord={onUpdateRecord}
                                        />
                                    ))
                                )}
                            </div>

                            {editable && (
                                <div className="bitable-kanban__quick-add">
                                    {showQuickAdd ? (
                                        <input
                                            className="bitable-kanban__quick-add-input"
                                            value={quickAddValue}
                                            onChange={(e) => setQuickAddValue(e.target.value)}
                                            onKeyDown={handleQuickAddKeyDown}
                                            onBlur={() => {
                                                if (quickAddValue.trim()) {
                                                    handleAddCard();
                                                } else {
                                                    setShowQuickAdd(false);
                                                }
                                            }}
                                            placeholder={t("bitable.kanbanView.addCard")}
                                            autoFocus
                                        />
                                    ) : (
                                        <button
                                            className="bitable-kanban__quick-add-button"
                                            onClick={() => setShowQuickAdd(true)}
                                        >
                                            <Plus style={{ width: 14, height: 14 }} />
                                            {t("bitable.kanbanView.addCard")}
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    </DroppableColumn>
                )}
            </div>
        </DraggableColumn>
    );
};
