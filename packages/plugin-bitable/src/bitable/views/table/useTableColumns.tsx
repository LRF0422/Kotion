import React, { useMemo } from "react";
import { Editor } from "@kn/editor";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@kn/ui";
import {
    Plus,
    MoreVertical,
    Pin,
    EyeOff,
    Trash2,
    ArrowUp,
    ArrowDown,
    Maximize2,
} from "@kn/icon";
import {
    FieldConfig,
    RecordData,
    ViewConfig,
    FieldType,
    SortConfig,
} from "../../../types";
import { SelectColumn } from "react-data-grid";
import { getFieldRenderer, getFieldEditor } from "../../fields";
import { getFieldTypeIcon } from "../../fields/fieldIcons";
import {
    computeSummary,
    nextSummaryMode,
    summaryPrefix,
} from "../../../utils/summary";
import { generateFieldId } from "../../../utils/id";

export interface UseTableColumnsParams {
    fields: FieldConfig[];
    editable: boolean;
    editor?: Editor;
    view: ViewConfig;
    t: (...args: any[]) => any;
    onUpdateField: (fieldId: string, updates: Partial<FieldConfig>) => void;
    onDeleteField: (fieldId: string) => void;
    onUpdateView: (viewId: string, updates: Partial<ViewConfig>) => void;
    onAddField: (field: FieldConfig) => void;
    onUpdateRecord: (recordId: string, updates: Partial<RecordData>) => void;
    onRecordClick?: (record: RecordData) => void;
}

/**
 * Builds react-data-grid column definitions from field configs.
 * Handles header rendering (icon, title, sort indicator, dropdown menu),
 * cell rendering (field renderer + expand for ID), edit cell, and summary.
 */
export function useTableColumns(params: UseTableColumnsParams): any[] {
    const {
        fields,
        editable,
        editor,
        view,
        t,
        onUpdateField,
        onDeleteField,
        onUpdateView,
        onAddField,
        onUpdateRecord,
        onRecordClick,
    } = params;

    /** Cycle sort: none -> asc -> desc -> none for a given field. */
    const handleSortToggle = useMemo(() => {
        return (fieldId: string) => {
            const sorts = view.sorts || [];
            const existing = sorts.find((s) => s.fieldId === fieldId);
            let newSorts: SortConfig[];
            if (!existing) {
                newSorts = [
                    ...sorts,
                    { id: `${fieldId}-sort`, fieldId, direction: "asc" as const },
                ];
            } else if (existing.direction === "asc") {
                newSorts = sorts.map((s) =>
                    s.fieldId === fieldId
                        ? { ...s, direction: "desc" as const }
                        : s
                );
            } else {
                newSorts = sorts.filter((s) => s.fieldId !== fieldId);
            }
            onUpdateView(view.id, { sorts: newSorts });
        };
    }, [view.sorts, view.id, onUpdateView]);

    const columns = useMemo(() => {
        const baseColumns: any[] = fields
            .filter((field) => field.isShow !== false)
            .map((field) => {
                const sortConfig = view.sorts?.find(
                    (s) => s.fieldId === field.id
                );
                return {
                    key: field.id,
                    name: field.title,
                    width: field.width || 180,
                    resizable: true,
                    sortable: false,
                    frozen: field.frozen || false,
                    editable: editable && field.type !== "id",
                    renderHeaderCell: () => (
                        <div
                            className="bitable-table-header"
                            onClick={(e) => {
                                e.stopPropagation();
                                handleSortToggle(field.id);
                            }}
                        >
                            <span className="bitable-table-header__icon">
                                {getFieldTypeIcon(field.type)}
                            </span>
                            <span className="bitable-table-header__title">
                                {field.title}
                            </span>
                            {field.type === FieldType.TEXT &&
                                field.id.includes("ai") && (
                                    <span className="bitable-table-header__ai-badge">
                                        AI
                                    </span>
                                )}
                            {field.frozen && (
                                <Pin className="bitable-table-header__frozen" />
                            )}
                            {sortConfig && (
                                <span className="bitable-table-header__sort">
                                    {sortConfig.direction === "asc" ? (
                                        <ArrowUp
                                            style={{ width: 14, height: 14 }}
                                        />
                                    ) : (
                                        <ArrowDown
                                            style={{ width: 14, height: 14 }}
                                        />
                                    )}
                                </span>
                            )}
                            {editable && (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <button
                                            className="bitable-table-header__menu"
                                            onClick={(e) =>
                                                e.stopPropagation()
                                            }
                                        >
                                            <MoreVertical
                                                style={{
                                                    width: 14,
                                                    height: 14,
                                                }}
                                            />
                                        </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="start">
                                        <DropdownMenuItem
                                            onClick={() =>
                                                onUpdateField(field.id, {
                                                    frozen: !field.frozen,
                                                })
                                            }
                                        >
                                            <Pin
                                                style={{
                                                    width: 14,
                                                    height: 14,
                                                }}
                                            />
                                            {field.frozen
                                                ? t(
                                                      "bitable.tableView.unfreezeColumn"
                                                  )
                                                : t(
                                                      "bitable.tableView.freezeColumn"
                                                  )}
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            onClick={() =>
                                                onUpdateField(field.id, {
                                                    isShow: false,
                                                })
                                            }
                                        >
                                            <EyeOff
                                                style={{
                                                    width: 14,
                                                    height: 14,
                                                }}
                                            />
                                            {t("bitable.tableView.hideColumn")}
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            onClick={() =>
                                                onDeleteField(field.id)
                                            }
                                        >
                                            <Trash2
                                                style={{
                                                    width: 14,
                                                    height: 14,
                                                }}
                                            />
                                            {t(
                                                "bitable.tableView.deleteColumn"
                                            )}
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            )}
                        </div>
                    ),
                    renderCell: (cellProps: any) => {
                        const Renderer = getFieldRenderer(field.type);
                        if (field.type === FieldType.ID) {
                            return (
                                <div className="bitable-table-cell bitable-table-cell--id">
                                    <Renderer
                                        value={cellProps.row[field.id]}
                                        field={field}
                                    />
                                    <button
                                        className="bitable-table-cell__expand"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onRecordClick?.(cellProps.row);
                                        }}
                                    >
                                        <Maximize2
                                            style={{
                                                width: 14,
                                                height: 14,
                                            }}
                                        />
                                    </button>
                                </div>
                            );
                        }
                        return (
                            <div className="bitable-table-cell">
                                <Renderer
                                    value={cellProps.row[field.id]}
                                    field={field}
                                />
                            </div>
                        );
                    },
                    renderEditCell: (editProps: any) => {
                        const EditorComponent = getFieldEditor(field.type);
                        const isSelectType = field.type === FieldType.SELECT;
                        return (
                            <EditorComponent
                                value={editProps.row[field.id]}
                                field={field}
                                onChange={(newValue: any) => {
                                    const updatedRow = {
                                        ...editProps.row,
                                        [field.id]: newValue,
                                    };
                                    editProps.onRowChange(
                                        updatedRow,
                                        isSelectType
                                    );
                                }}
                                editor={editor}
                                onSave={
                                    [
                                        FieldType.IMAGE,
                                        FieldType.ATTACHMENT,
                                        FieldType.PERSON,
                                    ].includes(field.type)
                                        ? (value: any) => {
                                              onUpdateRecord(editProps.row.id, {
                                                  [field.id]: value,
                                              });
                                          }
                                        : undefined
                                }
                            />
                        );
                    },
                    renderSummaryCell: ({ row }: any) => {
                        const mode = field.summary || "none";
                        const text = row?.agg?.[field.id] ?? "";
                        const content =
                            mode !== "none" && text !== "" ? (
                                <span>
                                    <span className="bitable-summary__prefix">
                                        {summaryPrefix(mode)}
                                    </span>
                                    {text}
                                </span>
                            ) : (
                                <span className="bitable-summary__placeholder">
                                    {t("bitable.tableView.summary")}
                                </span>
                            );
                        if (!editable)
                            return (
                                <div className="bitable-summary-cell">
                                    {mode !== "none" ? content : null}
                                </div>
                            );
                        return (
                            <button
                                className="bitable-summary-cell bitable-summary-cell--editable"
                                title={t("bitable.tableView.summaryCycle")}
                                onClick={() =>
                                    onUpdateField(field.id, {
                                        summary: nextSummaryMode(
                                            field.summary,
                                            field.type
                                        ),
                                    })
                                }
                            >
                                {content}
                            </button>
                        );
                    },
                };
            });

        // "+" column at end for adding new fields (editable mode only)
        if (editable) {
            baseColumns.push({
                key: "__add_field__",
                name: "",
                width: 40,
                resizable: false,
                sortable: false,
                frozen: false,
                editable: false,
                renderHeaderCell: () => (
                    <button
                        className="bitable-table-header__add"
                        onClick={(e) => {
                            e.stopPropagation();
                            const newField: FieldConfig = {
                                id: generateFieldId(),
                                type: FieldType.TEXT,
                                title:
                                    (t("bitable.field.newField") as string) ||
                                    "New Field",
                                width: 180,
                                isShow: true,
                            };
                            onAddField(newField);
                        }}
                    >
                        <Plus style={{ width: 16, height: 16 }} />
                    </button>
                ),
                renderCell: () => <></>,
            });
        }

        return editable ? [SelectColumn, ...baseColumns] : baseColumns;
    }, [
        fields,
        editable,
        editor,
        view.sorts,
        t,
        onUpdateField,
        onDeleteField,
        onAddField,
        onUpdateRecord,
        onRecordClick,
        handleSortToggle,
    ]);

    return columns;
}
