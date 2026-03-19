import React, { useState, useMemo, useRef, useEffect } from "react";
import { Editor } from "@kn/editor";
import { Button, Input, Checkbox } from "@kn/ui";
import {
    Plus,
    Search,
    Settings,
    Trash2,
    Type,
    Hash,
    Calendar,
    CheckSquare,
    Link,
    Mail,
    Phone,
    Star,
    BarChart2,
    List,
    Paperclip,
    Sparkles,
    Clock,
    Circle,
    FileText,
    MessageSquare,
    ImageIcon,
    Maximize2,
} from "@kn/icon";
import { useTranslation } from "@kn/common";
import { FieldConfig, RecordData, ViewConfig, FieldType } from "../../types";
import DataGrid, { SelectColumn } from 'react-data-grid';
import 'react-data-grid/lib/styles.css';
import { useTheme, cn } from "@kn/ui";
import { getFieldRenderer, getFieldEditor } from "../fields/FieldRenderers";

// 字段类型图标映射
const getFieldTypeIcon = (type: FieldType) => {
    switch (type) {
        case FieldType.TEXT:
            return <Type className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />;
        case FieldType.NUMBER:
            return <Hash className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />;
        case FieldType.DATE:
            return <Calendar className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />;
        case FieldType.CHECKBOX:
            return <CheckSquare className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />;
        case FieldType.URL:
            return <Link className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />;
        case FieldType.EMAIL:
            return <Mail className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />;
        case FieldType.PHONE:
            return <Phone className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />;
        case FieldType.RATING:
            return <Star className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />;
        case FieldType.PROGRESS:
            return <BarChart2 className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />;
        case FieldType.SELECT:
        case FieldType.MULTI_SELECT:
            return <Circle className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />;
        case FieldType.IMAGE:
            return <ImageIcon className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />;
        case FieldType.ATTACHMENT:
            return <Paperclip className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />;
        case FieldType.CREATED_TIME:
        case FieldType.UPDATED_TIME:
            return <Clock className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />;
        case FieldType.ID:
        case FieldType.AUTO_NUMBER:
            return <Hash className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />;
        default:
            return <Type className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />;
    }
};

interface TableViewProps {
    view: ViewConfig;
    fields: FieldConfig[];
    data: RecordData[];
    onAddRecord: () => void;
    onUpdateRecord: (recordId: string, updates: Partial<RecordData>) => void;
    onDeleteRecord: (recordIds: string[]) => void;
    onAddField: (field: FieldConfig) => void;
    onUpdateField: (fieldId: string, updates: Partial<FieldConfig>) => void;
    onDeleteField: (fieldId: string) => void;
    onUpdateView: (viewId: string, updates: Partial<ViewConfig>) => void;
    editable: boolean;
    editor?: Editor;
    searchText?: string;
    onRecordClick?: (record: RecordData) => void;
}

export const TableView: React.FC<TableViewProps> = (props) => {
    const {
        fields,
        data,
        onAddRecord,
        onUpdateRecord,
        onDeleteRecord,
        editable,
        editor,
        searchText: searchTextProp,
        onRecordClick
    } = props;

    const { theme } = useTheme();
    const { t } = useTranslation();
    const [selectedRows, setSelectedRows] = useState<ReadonlySet<string>>(new Set());
    const searchText = searchTextProp || '';

    // Use ref to store latest onUpdateRecord to avoid stale closure without triggering re-renders
    const onUpdateRecordRef = useRef(onUpdateRecord);
    useEffect(() => {
        onUpdateRecordRef.current = onUpdateRecord;
    }, [onUpdateRecord]);

    // 过滤数据
    const filteredData = useMemo(() => {
        if (!searchText) return data;

        return data.filter(record => {
            return fields.some(field => {
                const value = record[field.id];
                if (value === null || value === undefined) return false;
                return String(value).toLowerCase().includes(searchText.toLowerCase());
            });
        });
    }, [data, searchText, fields]);

    // 虚拟滚动阈值
    const VIRTUALIZED_THRESHOLD = 500;
    // 数据超过阈值时启用虚拟滚动
    const enableVirtualization = filteredData.length > VIRTUALIZED_THRESHOLD;

    // 转换为DataGrid列
    const columns = useMemo(() => {
        const baseColumns = fields
            .filter(field => field.isShow !== false)
            .map(field => ({
                key: field.id,
                name: field.title,
                width: field.width || 180,
                resizable: true,
                sortable: true,
                editable: editable && field.type !== 'id',
                renderHeaderCell: (headerProps: any) => {
                    return (
                        <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400 font-normal text-sm">
                            {getFieldTypeIcon(field.type)}
                            <span>{field.title}</span>
                            {field.type === FieldType.TEXT && field.id.includes('ai') && (
                                <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded">AI</span>
                            )}
                        </div>
                    );
                },
                renderCell: (cellProps: any) => {
                    const Renderer = getFieldRenderer(field.type);
                    if (field.type === FieldType.ID) {
                        return (
                            <div className="flex items-center h-full py-1 group/id">
                                <Renderer value={cellProps.row[field.id]} field={field} />
                                <button
                                    className="ml-auto opacity-0 group-hover/id:opacity-100 transition-opacity p-0.5 rounded hover:bg-gray-100 dark:hover:bg-accent"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onRecordClick?.(cellProps.row);
                                    }}
                                >
                                    <Maximize2 className="h-3.5 w-3.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" />
                                </button>
                            </div>
                        );
                    }
                    return (
                        <div className="flex items-center h-full py-1">
                            <Renderer value={cellProps.row[field.id]} field={field} />
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
                                const updatedRow = { ...editProps.row, [field.id]: newValue };
                                // 单选字段选中后直接提交关闭编辑态
                                editProps.onRowChange(updatedRow, isSelectType);
                            }}
                            editor={editor}
                            onSave={field.type === FieldType.IMAGE ? (value: any) => {
                                onUpdateRecord(editProps.row.id, { [field.id]: value });
                            } : undefined}
                        />
                    );
                }
            }));

        return editable ? [SelectColumn, ...baseColumns] : baseColumns;
    }, [fields, editable, editor]);

    const handleDeleteSelected = () => {
        onDeleteRecord(Array.from(selectedRows));
        setSelectedRows(new Set());
    };

    return (
        <div className="bitable-table-view">
            {/* 工具栏 - 已移到BitableView */}
            {editable && selectedRows.size > 0 && (
                <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 dark:bg-card border-b border-gray-200 dark:border-border">
                    <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-accent"
                        onClick={handleDeleteSelected}
                    >
                        <Trash2 className="h-4 w-4 mr-1" />
                        {t('bitable.tableView.deleteSelected', { count: selectedRows.size })}
                    </Button>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                        {t('bitable.tableView.selectedCount', { count: selectedRows.size })}
                    </span>
                </div>
            )}

            {/* 数据表格 */}
            <div className="bitable-grid-container" style={{ height: enableVirtualization ? 'calc(100vh - 300px)' : 'auto', minHeight: enableVirtualization ? 400 : 'auto' }}>
                <DataGrid
                    columns={columns}
                    rows={filteredData}
                    rowKeyGetter={(row) => row.id}
                    selectedRows={selectedRows}
                    onSelectedRowsChange={setSelectedRows}
                    onRowsChange={(rows, changes) => {
                        // Persist changes when editing is committed (on blur/Enter)
                        if (changes.indexes.length > 0) {
                            changes.indexes.forEach((index) => {
                                const row = rows[index];
                                if (row) {
                                    // Use ref to get the latest onUpdateRecord without causing re-renders
                                    onUpdateRecordRef.current(row.id, row);
                                }
                            });
                        }
                    }}
                    className={cn(
                        "bitable-data-grid",
                        theme === 'dark' ? "rdg-dark" : "rdg-light"
                    )}
                    style={{
                        height: '100%',
                        minHeight: 400,
                        border: 'none'
                    }}
                    rowHeight={40}
                    headerRowHeight={36}
                // virtualized={enableVirtualization}
                />
            </div>

            {/* 添加新行按钮 */}
            {editable && (
                <div
                    className="flex items-center gap-2 px-4 py-2 text-gray-500 hover:bg-gray-50 dark:hover:bg-card cursor-pointer transition-colors border-b border-gray-200 dark:border-border"
                    onClick={onAddRecord}
                >
                    <Plus className="h-4 w-4" />
                    <span className="text-sm">{t('bitable.actions.newPage')}</span>
                </div>
            )}

            {/* 自定义样式 */}
            <style>{`
                .bitable-data-grid.rdg-light {
                    --rdg-background-color: transparent;
                    --rdg-header-background-color: rgba(249, 250, 251, 0.4);
                    --rdg-row-hover-background-color: rgba(243, 244, 246, 0.5);
                    --rdg-selection-color: #3b82f6;
                    --rdg-border-color: #e5e7eb;
                    --rdg-color: #111827;
                    --rdg-header-color: #6b7280;
                    --rdg-cell-padding-inline: 8px;
                    font-size: 14px;
                }

                .bitable-data-grid.rdg-light .rdg-header-row {
                    background-color: rgba(249, 250, 251, 0.4);
                    border-bottom: 1px solid #e5e7eb;
                }

                .bitable-data-grid.rdg-light .rdg-header-row .rdg-cell {
                    border-right: 1px solid #e5e7eb;
                    border-bottom: 1px solid #e5e7eb;
                    font-weight: 400;
                }

                .bitable-data-grid.rdg-light .rdg-row {
                    background-color: transparent;
                    border-bottom: 1px solid #e5e7eb;
                }

                .bitable-data-grid.rdg-light .rdg-row:hover {
                    background-color: rgba(249, 250, 251, 0.5);
                }

                .bitable-data-grid.rdg-light .rdg-cell {
                    border-right: 1px solid #e5e7eb;
                    border-bottom: 1px solid #e5e7eb;
                    padding: 0 8px;
                }

                .bitable-data-grid.rdg-dark {
                    --rdg-background-color: transparent;
                    --rdg-header-background-color: rgba(25, 25, 25, 0.4);
                    --rdg-row-hover-background-color: rgba(37, 37, 37, 0.5);
                    --rdg-selection-color: #3b82f6;
                    --rdg-border-color: #4a4a4a;
                    --rdg-color: #fff;
                    --rdg-header-color: #9ca3af;
                    --rdg-cell-padding-inline: 8px;
                    font-size: 14px;
                }

                .bitable-data-grid.rdg-dark .rdg-header-row {
                    background-color: rgba(25, 25, 25, 0.4);
                    border-bottom: 1px solid #4a4a4a;
                }

                .bitable-data-grid.rdg-dark .rdg-header-row .rdg-cell {
                    border-right: 1px solid #4a4a4a;
                    border-bottom: 1px solid #4a4a4a;
                    font-weight: 400;
                }

                .bitable-data-grid.rdg-dark .rdg-row {
                    background-color: transparent;
                    border-bottom: 1px solid #4a4a4a;
                }

                .bitable-data-grid.rdg-dark .rdg-row:hover {
                    background-color: rgba(37, 37, 37, 0.5);
                }

                .bitable-data-grid.rdg-dark .rdg-cell {
                    border-right: 1px solid #4a4a4a;
                    border-bottom: 1px solid #4a4a4a;
                    padding: 0 8px;
                }

                .bitable-data-grid.rdg-dark .rdg-cell[aria-selected="true"] {
                    outline: 2px solid #3b82f6;
                    outline-offset: -2px;
                }

                .bitable-data-grid.rdg-dark .rdg-checkbox-label {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .bitable-data-grid.rdg-dark .rdg-checkbox {
                    accent-color: #3b82f6;
                }

                .bitable-data-grid.rdg-dark .rdg-row-selected {
                    background-color: rgba(59, 130, 246, 0.1);
                }

                .bitable-data-grid.rdg-dark .rdg-row-selected:hover {
                    background-color: rgba(59, 130, 246, 0.15);
                }

                /* 允许编辑单元格中的下拉菜单溢出 */
                .bitable-data-grid .rdg-cell[aria-selected="true"] {
                    overflow: visible;
                    position: relative;
                }

                .bitable-data-grid .rdg-cell-editor {
                    overflow: visible;
                }
            `}</style>
        </div>
    );
};
