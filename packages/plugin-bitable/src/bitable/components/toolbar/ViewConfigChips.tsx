import React from "react";
import { X, ArrowUp, ArrowDown } from "@kn/icon";
import { FieldConfig, ViewConfig, FilterOperator } from "../../../types";

interface ViewConfigChipsProps {
    view: ViewConfig;
    fields: FieldConfig[];
    onUpdateView: (viewId: string, updates: Partial<ViewConfig>) => void;
}

const OPERATOR_LABELS: Record<FilterOperator, string> = {
    [FilterOperator.EQUALS]: "=",
    [FilterOperator.NOT_EQUALS]: "≠",
    [FilterOperator.CONTAINS]: "∋",
    [FilterOperator.NOT_CONTAINS]: "∌",
    [FilterOperator.IS_EMPTY]: "empty",
    [FilterOperator.IS_NOT_EMPTY]: "!empty",
    [FilterOperator.GREATER_THAN]: ">",
    [FilterOperator.LESS_THAN]: "<",
    [FilterOperator.GREATER_THAN_OR_EQUAL]: "≥",
    [FilterOperator.LESS_THAN_OR_EQUAL]: "≤",
    [FilterOperator.IS_ANY_OF]: "any of",
    [FilterOperator.IS_NONE_OF]: "none of",
};

/**
 * Renders active filters, sorts, and groups as removable chips
 * in a row below the toolbar (Notion-style).
 * - Filter chips: [field op value X]
 * - Sort chips: [field ↑/↓ X] — click to toggle direction
 * - Group chips: [Group: field X]
 */
export const ViewConfigChips: React.FC<ViewConfigChipsProps> = ({
    view,
    fields,
    onUpdateView,
}) => {
    const filters = view.filters || [];
    const sorts = view.sorts || [];
    const groups = view.groups || [];

    const hasAny =
        filters.length > 0 || sorts.length > 0 || groups.length > 0;
    if (!hasAny) return null;

    const removeFilter = (filterId: string) => {
        onUpdateView(view.id, {
            filters: filters.filter((f) => f.id !== filterId),
        });
    };

    const removeSort = (sortId: string) => {
        onUpdateView(view.id, {
            sorts: sorts.filter((s) => s.id !== sortId),
        });
    };

    const toggleSort = (sortId: string) => {
        const newSorts = sorts.map((s) =>
            s.id === sortId
                ? {
                      ...s,
                      direction:
                          s.direction === "asc"
                              ? ("desc" as const)
                              : ("asc" as const),
                  }
                : s
        );
        onUpdateView(view.id, { sorts: newSorts });
    };

    const removeGroup = (index: number) => {
        const newGroups = groups.filter((_, i) => i !== index);
        onUpdateView(view.id, { groups: newGroups });
    };

    return (
        <div className="bitable-chips">
            {/* Filter chips */}
            {filters.map((filter) => {
                const field = fields.find((f) => f.id === filter.fieldId);
                return (
                    <span key={filter.id} className="bitable-chip">
                        <span className="bitable-chip__label">
                            {field?.title || "?"}{" "}
                            {OPERATOR_LABELS[filter.operator]}{" "}
                            {filter.value || ""}
                        </span>
                        <button
                            className="bitable-chip__remove"
                            onClick={() => removeFilter(filter.id)}
                        >
                            <X style={{ width: 12, height: 12 }} />
                        </button>
                    </span>
                );
            })}

            {/* Sort chips — click to toggle direction */}
            {sorts.map((sort) => {
                const field = fields.find((f) => f.id === sort.fieldId);
                return (
                    <span
                        key={sort.id}
                        className="bitable-chip"
                        onClick={() => toggleSort(sort.id)}
                    >
                        <span className="bitable-chip__label">
                            {field?.title || "?"}
                            {sort.direction === "asc" ? (
                                <ArrowUp style={{ width: 12, height: 12 }} />
                            ) : (
                                <ArrowDown style={{ width: 12, height: 12 }} />
                            )}
                        </span>
                        <button
                            className="bitable-chip__remove"
                            onClick={(e) => {
                                e.stopPropagation();
                                removeSort(sort.id);
                            }}
                        >
                            <X style={{ width: 12, height: 12 }} />
                        </button>
                    </span>
                );
            })}

            {/* Group chips */}
            {groups.map((group, index) => {
                const field = fields.find((f) => f.id === group.fieldId);
                return (
                    <span key={index} className="bitable-chip">
                        <span className="bitable-chip__label">
                            Group: {field?.title || "?"}
                        </span>
                        <button
                            className="bitable-chip__remove"
                            onClick={() => removeGroup(index)}
                        >
                            <X style={{ width: 12, height: 12 }} />
                        </button>
                    </span>
                );
            })}
        </div>
    );
};
