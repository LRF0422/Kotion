import React, { useState, useCallback, useRef, useEffect } from "react";
import { Expand } from "@kn/icon";
import { useTranslation } from "@kn/common";
import { FieldConfig, RecordData } from "../../../types";
import { getFieldRenderer } from "../../fields";
import { DraggableCard } from "./dnd";

interface KanbanCardProps {
    record: RecordData;
    columnId: string;
    cardFields: FieldConfig[];
    editable: boolean;
    disabled?: boolean;
    onRecordClick?: (record: RecordData) => void;
    onUpdateRecord: (recordId: string, updates: Partial<RecordData>) => void;
}

/**
 * Kanban card with:
 * - Field renderers showing display fields
 * - Hover expand icon (top-right, 18×18px)
 * - Double-click first field to inline-edit title
 * - Click card opens record drawer
 */
export const KanbanCard: React.FC<KanbanCardProps> = ({
    record,
    columnId,
    cardFields,
    editable,
    disabled,
    onRecordClick,
    onUpdateRecord,
}) => {
    const { t } = useTranslation();
    const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
    const [editValue, setEditValue] = useState("");
    const editRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (editingFieldId && editRef.current) {
            editRef.current.focus();
            editRef.current.select();
        }
    }, [editingFieldId]);

    const handleDoubleClickField = useCallback(
        (field: FieldConfig) => {
            if (!editable || disabled) return;
            setEditingFieldId(field.id);
            setEditValue(String(record[field.id] ?? ""));
        },
        [editable, disabled, record]
    );

    const saveEdit = useCallback(() => {
        if (editingFieldId) {
            onUpdateRecord(record.id, { [editingFieldId]: editValue });
        }
        setEditingFieldId(null);
    }, [editingFieldId, editValue, record.id, onUpdateRecord]);

    const cancelEdit = useCallback(() => {
        setEditingFieldId(null);
        setEditValue("");
    }, []);

    return (
        <DraggableCard record={record} columnId={columnId} disabled={disabled || !editable}>
            <div
                className="bitable-kanban__card"
                onClick={(e) => {
                    if (editingFieldId) return;
                    e.stopPropagation();
                    onRecordClick?.(record);
                }}
            >
                <button
                    className="bitable-kanban__card-expand"
                    onClick={(e) => {
                        e.stopPropagation();
                        onRecordClick?.(record);
                    }}
                >
                    <Expand style={{ width: 14, height: 14 }} />
                </button>

                <div className="bitable-kanban__card-content">
                    {cardFields.map((field, idx) => {
                        const isEditing = editingFieldId === field.id;
                        const isFirst = idx === 0;

                        if (isEditing) {
                            return (
                                <div key={field.id} className="bitable-kanban__card-field">
                                    <input
                                        ref={editRef}
                                        className="bitable-kanban__card-edit-input"
                                        value={editValue}
                                        onChange={(e) => setEditValue(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") saveEdit();
                                            else if (e.key === "Escape") cancelEdit();
                                        }}
                                        onBlur={saveEdit}
                                    />
                                </div>
                            );
                        }

                        const Renderer = getFieldRenderer(field.type);
                        return (
                            <div
                                key={field.id}
                                className={`bitable-kanban__card-field${
                                    isFirst ? " bitable-kanban__card-field--title" : ""
                                }`}
                                onDoubleClick={() => handleDoubleClickField(field)}
                            >
                                {!isFirst && (
                                    <div className="bitable-kanban__card-field-label">
                                        {field.title}
                                    </div>
                                )}
                                <div className="bitable-kanban__card-field-value">
                                    <Renderer value={record[field.id]} field={field} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </DraggableCard>
    );
};
