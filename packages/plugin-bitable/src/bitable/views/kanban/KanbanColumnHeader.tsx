import React, { useState, useCallback } from "react";
import {
    Input,
    ColorPicker,
} from "@kn/ui";
import {
    ChevronRight,
    ChevronDown,
    MoreHorizontal,
    Pencil,
    Trash2,
    Check,
    X,
} from "@kn/icon";
import { useTranslation } from "@kn/common";
import { FieldConfig, SelectOption } from "../../../types";
import { KANBAN_UNASSIGNED } from "../../../utils/kanbanGroups";
import { OPTION_COLORS } from "../../../utils/colors";
import type { KanbanColumn } from "../../../utils/kanbanGroups";
import { ContextMenu, type ContextMenuEntry } from "../../components/ContextMenu";

interface KanbanColumnHeaderProps {
    column: KanbanColumn;
    groupByField: FieldConfig;
    editable: boolean;
    collapsed: boolean;
    onToggleCollapse: () => void;
    onRename: (optionId: string, label: string) => void;
    onChangeColor: (optionId: string, color: string) => void;
    onDeleteOption: (optionId: string) => void;
    onCollapseAll?: () => void;
}

/**
 * Kanban column header with color dot, count, collapse toggle,
 * right-click context menu (rename, color, delete).
 */
export const KanbanColumnHeader: React.FC<KanbanColumnHeaderProps> = ({
    column,
    groupByField,
    editable,
    collapsed,
    onToggleCollapse,
    onRename,
    onChangeColor,
    onDeleteOption,
    onCollapseAll,
}) => {
    const { t } = useTranslation();
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState("");
    const [showColorPicker, setShowColorPicker] = useState(false);

    const isSelectField = groupByField.type === "select";
    const isUnassigned = column.key === KANBAN_UNASSIGNED;

    const startEditing = useCallback(() => {
        setEditValue(column.label);
        setIsEditing(true);
    }, [column.label]);

    const saveEditing = useCallback(() => {
        if (editValue.trim()) {
            onRename(column.key, editValue.trim());
        }
        setIsEditing(false);
    }, [editValue, column.key, onRename]);

    const cancelEditing = useCallback(() => {
        setIsEditing(false);
        setEditValue("");
    }, []);

    const menuItems: ContextMenuEntry[] = [];
    if (editable && isSelectField && !isUnassigned) {
        menuItems.push(
            {
                label: t("bitable.kanbanView.renameGroup"),
                icon: <Pencil style={{ width: 14, height: 14 }} />,
                onClick: startEditing,
            },
            {
                label: t("bitable.kanbanView.color"),
                icon: <span style={{ width: 14, height: 14, display: "inline-block" }} />,
                onClick: () => setShowColorPicker(!showColorPicker),
            },
            { separator: true },
            {
                label: t("bitable.kanbanView.deleteGroup"),
                icon: <Trash2 style={{ width: 14, height: 14 }} />,
                onClick: () => onDeleteOption(column.key),
                danger: true,
            }
        );
    }
    if (onCollapseAll) {
        menuItems.push({ separator: true });
        menuItems.push({
            label: "Collapse All",
            onClick: onCollapseAll,
        });
    }

    return (
        <div className="bitable-kanban__column-header">
            <div
                className="bitable-kanban__column-toggle"
                onClick={(e) => {
                    e.stopPropagation();
                    onToggleCollapse();
                }}
            >
                {collapsed ? (
                    <ChevronRight style={{ width: 14, height: 14 }} />
                ) : (
                    <ChevronDown style={{ width: 14, height: 14 }} />
                )}
            </div>

            {isEditing ? (
                <div
                    className="bitable-kanban__column-edit"
                    onClick={(e) => e.stopPropagation()}
                >
                    <Input
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") saveEditing();
                            else if (e.key === "Escape") cancelEditing();
                        }}
                        onBlur={saveEditing}
                        autoFocus
                        className="h-7 text-sm"
                    />
                    <button
                        className="bitable-kanban__column-edit-confirm"
                        onClick={saveEditing}
                    >
                        <Check style={{ width: 14, height: 14 }} />
                    </button>
                    <button
                        className="bitable-kanban__column-edit-cancel"
                        onClick={cancelEditing}
                    >
                        <X style={{ width: 14, height: 14 }} />
                    </button>
                </div>
            ) : (
                <div className="bitable-kanban__column-title">
                    {column.color && (
                        <span
                            className="bitable-kanban__column-dot"
                            style={{ backgroundColor: column.color }}
                        />
                    )}
                    <span className="bitable-kanban__column-label">{column.label}</span>
                    <span className="bitable-kanban__column-count">{column.records.length}</span>
                </div>
            )}

            {showColorPicker && isSelectField && !isUnassigned && (
                <div
                    className="bitable-kanban__color-picker"
                    onClick={(e) => e.stopPropagation()}
                >
                    <ColorPicker
                        value={column.color || OPTION_COLORS[0]}
                        onChange={(c) => {
                            onChangeColor(column.key, c);
                            setShowColorPicker(false);
                        }}
                        swatches={OPTION_COLORS}
                        trigger="button"
                        align="start"
                    />
                </div>
            )}

            {menuItems.length > 0 && (
                <ContextMenu items={menuItems}>
                    <div className="bitable-kanban__column-more">
                        <MoreHorizontal style={{ width: 14, height: 14 }} />
                    </div>
                </ContextMenu>
            )}
        </div>
    );
};
