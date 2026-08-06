import React, { useState, useMemo, useCallback } from "react";
import { Editor } from "@kn/editor";
import { Trash2, Copy } from "@kn/icon";
import { useTranslation } from "@kn/common";
import { FieldConfig, RecordData, ViewConfig } from "../../types";
import DataGrid, { Row as DataGridRow } from "react-data-grid";
import type { RenderRowProps } from "react-data-grid";
import "react-data-grid/lib/styles.css";
import { useResolvedTheme, cn } from "@kn/ui";
import { createFillHandler } from "../../utils/autoFill";
import { computeSummary } from "../../utils/summary";
import { debounce } from "lodash";
import { useTableColumns, GroupHeaderRow, AddRowBar } from "./table";
import type { GroupedRow } from "./table";

/**
 * Rows beyond this count get a height-capped viewport so react-data-grid can
 * actually virtualize. An auto-height grid makes rdg's viewport equal to its
 * content, so every row and cell lands in the DOM — Safari's layout cost on
 * such a subtree inside the editor makes the whole page janky.
 */
const VIRTUALIZED_THRESHOLD = 30;

/** Grid style is constant — kept out of render to preserve prop identity. */
const GRID_STYLE: React.CSSProperties = {
    height: "100%",
    minHeight: 400,
    border: "none",
};

const rowKeyGetter = (row: any) => row.id;

interface TableViewProps {
    view: ViewConfig;
    fields: FieldConfig[];
    data: RecordData[];
    onAddRecord: () => void;
    onDuplicateRecord?: (recordIds: string[]) => void;
    onUpdateRecord: (recordId: string, updates: Partial<RecordData>) => void;
    onBatchUpdateRecords: (updatesMap: Map<string, Partial<RecordData>>) => void;
    onDeleteRecord: (recordIds: string[]) => void;
    onAddField: (field: FieldConfig) => void;
    onUpdateField: (fieldId: string, updates: Partial<FieldConfig>) => void;
    onDeleteField: (fieldId: string) => void;
    onUpdateView: (viewId: string, updates: Partial<ViewConfig>) => void;
    editable: boolean;
    editor?: Editor;
    searchText?: string;
    onRecordClick?: (record: RecordData) => void;
    groups?: Map<string, RecordData[]>;
}

const TableViewComponent: React.FC<TableViewProps> = (props) => {
    const {
        view,
        fields,
        data,
        onAddRecord,
        onDuplicateRecord,
        onUpdateRecord,
        onBatchUpdateRecords,
        onDeleteRecord,
        onAddField,
        onUpdateField,
        onDeleteField,
        onUpdateView,
        editable,
        editor,
        searchText: searchTextProp,
        onRecordClick,
        groups: groupedData,
    } = props;

    const resolvedTheme = useResolvedTheme();
    const { t } = useTranslation();
    const [selectedRows, setSelectedRows] = useState<ReadonlySet<string>>(
        new Set()
    );
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
        new Set()
    );
    const searchText = searchTextProp || "";

    // --- Filter data by search text ---
    const filteredData = useMemo(() => {
        if (!searchText) return data;
        const keyword = searchText.toLowerCase();
        return data.filter((record) =>
            fields.some((field) => {
                const value = record[field.id];
                if (value === null || value === undefined) return false;
                return String(value).toLowerCase().includes(keyword);
            })
        );
    }, [data, searchText, fields]);

    const isGrouped = groupedData && groupedData.size > 0;

    // --- Group field for labels ---
    const groupField = useMemo(() => {
        if (!view.groups?.length) return undefined;
        return fields.find((f) => f.id === view.groups![0]!.fieldId);
    }, [view.groups, fields]);

    // --- Build flat rows with group headers interspersed ---
    const flatRows: GroupedRow[] = useMemo(() => {
        if (!isGrouped || !groupedData) return filteredData;
        const rows: GroupedRow[] = [];
        groupedData.forEach((records, key) => {
            rows.push({
                id: `__group__${key}`,
                _isGroupHeader: true,
                _groupKey: key,
                _groupCount: records.length,
            });
            if (!collapsedGroups.has(key)) {
                rows.push(...records);
            }
        });
        return rows;
    }, [isGrouped, filteredData, groupedData, collapsedGroups]);

    // --- Bounded viewport: required for rdg virtualization to kick in ---
    const rows = isGrouped ? flatRows : filteredData;
    const boundedViewport = rows.length > VIRTUALIZED_THRESHOLD;
    const containerStyle = useMemo<React.CSSProperties>(
        () => ({
            height: boundedViewport ? "calc(100dvh - 300px)" : "auto",
            minHeight: boundedViewport ? 400 : "auto",
        }),
        [boundedViewport]
    );

    // --- Column definitions via hook ---
    const columns = useTableColumns({
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
    });

    // --- Summary rows ---
    const hasSummary = useMemo(
        () => fields.some((f) => f.summary && f.summary !== "none"),
        [fields]
    );
    const summaryRows = useMemo(() => {
        const agg: Record<string, string> = {};
        fields.forEach((f) => {
            const mode = f.summary || "none";
            agg[f.id] =
                mode === "none" ? "" : computeSummary(mode, f, filteredData);
        });
        return [{ id: "__summary__", agg }];
    }, [fields, filteredData]);

    // --- Debounced column width persistence ---
    const persistColumnWidth = useMemo(
        () =>
            debounce((fieldId: string, width: number) => {
                onUpdateField(fieldId, { width });
            }, 300),
        [onUpdateField]
    );

    // --- Drag-fill handlers ---
    const handleFill = useMemo(
        () => createFillHandler(fields, filteredData),
        [fields, filteredData]
    );
    const groupedFill = useMemo(() => {
        if (!isGrouped) return undefined;
        const dataRows = flatRows.filter((r) => !r._isGroupHeader);
        return createFillHandler(fields, dataRows);
    }, [isGrouped, flatRows, fields]);

    // --- Selection handlers ---
    const handleDeleteSelected = useCallback(() => {
        onDeleteRecord(Array.from(selectedRows));
        setSelectedRows(new Set());
    }, [onDeleteRecord, selectedRows]);

    const handleDuplicateSelected = useCallback(() => {
        onDuplicateRecord?.(Array.from(selectedRows));
        setSelectedRows(new Set());
    }, [onDuplicateRecord, selectedRows]);

    // --- Grid callbacks (stable identity keeps rdg from re-rendering rows) ---
    const handleRowsChange = useCallback(
        (updatedRows: any, changes: any) => {
            if (changes.indexes.length > 0) {
                const updatesMap = new Map<string, Partial<RecordData>>();
                changes.indexes.forEach((index: number) => {
                    const row = updatedRows[index];
                    if (row && !row._isGroupHeader) {
                        updatesMap.set(row.id, row);
                    }
                });
                if (updatesMap.size > 0) {
                    onBatchUpdateRecords(updatesMap);
                }
            }
        },
        [onBatchUpdateRecords]
    );

    const handleColumnResize = useCallback(
        (column: any, width: number) => {
            const w = Math.round(
                typeof width === "number" ? width : parseFloat(width)
            );
            if (editable && column?.key && !Number.isNaN(w)) {
                persistColumnWidth(column.key, w);
            }
        },
        [editable, persistColumnWidth]
    );

    // --- Group toggle ---
    const toggleGroup = useCallback((groupKey: string) => {
        setCollapsedGroups((prev) => {
            const next = new Set(prev);
            if (next.has(groupKey)) {
                next.delete(groupKey);
            } else {
                next.add(groupKey);
            }
            return next;
        });
    }, []);

    // --- Custom row renderer for group headers ---
    const renderGroupRow = useCallback(
        (key: React.Key, rowProps: RenderRowProps<GroupedRow>) => {
            const row = rowProps.row;
            if (row._isGroupHeader) {
                return (
                    <GroupHeaderRow
                        key={key}
                        row={row}
                        collapsed={collapsedGroups.has(row._groupKey || "")}
                        onToggle={() => toggleGroup(row._groupKey || "")}
                        groupField={groupField}
                    />
                );
            }
            return <DataGridRow key={key} {...rowProps} />;
        },
        [collapsedGroups, groupField, toggleGroup]
    );

    const getRowClass = useCallback((row: GroupedRow) => {
        if (row._isGroupHeader) return "bitable-group-header-row-container";
        return undefined;
    }, []);

    const gridRenderers = useMemo(
        () => (isGrouped ? { renderRow: renderGroupRow as any } : undefined),
        [isGrouped, renderGroupRow]
    );

    const gridClassName = useMemo(
        () =>
            cn(
                "bitable-data-grid",
                resolvedTheme === "dark" ? "rdg-dark" : "rdg-light"
            ),
        [resolvedTheme]
    );

    return (
        <div className="bitable-table-view">
            {/* Selection action bar */}
            {editable && selectedRows.size > 0 && (
                <div className="bitable-selection-bar">
                    <button
                        className="bitable-selection-bar__action bitable-selection-bar__action--danger"
                        onClick={handleDeleteSelected}
                    >
                        <Trash2 style={{ width: 14, height: 14 }} />
                        {t("bitable.tableView.deleteSelected", {
                            count: selectedRows.size,
                        })}
                    </button>
                    {onDuplicateRecord && (
                        <button
                            className="bitable-selection-bar__action"
                            onClick={handleDuplicateSelected}
                        >
                            <Copy style={{ width: 14, height: 14 }} />
                            {t("bitable.tableView.duplicate")}
                        </button>
                    )}
                    <span className="bitable-selection-bar__text">
                        {t("bitable.tableView.selectedCount", {
                            count: selectedRows.size,
                        })}
                    </span>
                </div>
            )}

            {/* Data grid — single grid for both grouped and non-grouped */}
            <div className="bitable-grid-container" style={containerStyle}>
                <DataGrid
                    columns={columns}
                    rows={rows}
                    rowKeyGetter={rowKeyGetter}
                    selectedRows={selectedRows}
                    onSelectedRowsChange={setSelectedRows as any}
                    onRowsChange={handleRowsChange}
                    onFill={isGrouped ? groupedFill : handleFill}
                    onColumnResize={handleColumnResize}
                    bottomSummaryRows={
                        hasSummary || editable
                            ? (summaryRows as any)
                            : undefined
                    }
                    renderers={gridRenderers}
                    rowClass={isGrouped ? (getRowClass as any) : undefined}
                    className={gridClassName}
                    style={GRID_STYLE}
                    rowHeight={36}
                    headerRowHeight={32}
                />
            </div>

            {/* Inline add row */}
            {editable && (
                <AddRowBar
                    onAdd={onAddRecord}
                    label={t("bitable.tableView.addRecord") as string}
                />
            )}
        </div>
    );
};

/**
 * Memoized: the grid is the most expensive subtree in bitable, so unrelated
 * BitableView state (dialogs, record drawer, toolbar) must not re-render it.
 */
export const TableView = React.memo(TableViewComponent);
