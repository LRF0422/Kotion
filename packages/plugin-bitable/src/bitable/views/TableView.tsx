import React, { useState, useMemo } from "react";
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
    ImageIcon
} from "@kn/icon";
import { FieldConfig, RecordData, ViewConfig, FieldType } from "../../types";
import DataGrid, { SelectColumn } from 'react-data-grid';
import 'react-data-grid/lib/styles.css';
import { useTheme, cn } from "@kn/ui";
import { getFieldRenderer, getFieldEditor } from "../fields/FieldRenderers";

// 字段类型图标映射
const getFieldTypeIcon = (type: FieldType) => {
    switch (type) {
        case FieldType.TEXT:
            return <Type className="h-3.5 w-3.5 text-gray-500" />;
        case FieldType.NUMBER:
            return <Hash className="h-3.5 w-3.5 text-gray-500" />;
        case FieldType.DATE:
            return <Calendar className="h-3.5 w-3.5 text-gray-500" />;
        case FieldType.CHECKBOX:
            return <CheckSquare className="h-3.5 w-3.5 text-gray-500" />;
        case FieldType.URL:
            return <Link className="h-3.5 w-3.5 text-gray-500" />;
        case FieldType.EMAIL:
            return <Mail className="h-3.5 w-3.5 text-gray-500" />;
        case FieldType.PHONE:
            return <Phone className="h-3.5 w-3.5 text-gray-500" />;
        case FieldType.RATING:
            return <Star className="h-3.5 w-3.5 text-gray-500" />;
        case FieldType.PROGRESS:
            return <BarChart2 className="h-3.5 w-3.5 text-gray-500" />;
        case FieldType.SELECT:
        case FieldType.MULTI_SELECT:
            return <Circle className="h-3.5 w-3.5 text-gray-500" />;
        case FieldType.IMAGE:
            return <ImageIcon className="h-3.5 w-3.5 text-gray-500" />;
        case FieldType.ATTACHMENT:
            return <Paperclip className="h-3.5 w-3.5 text-gray-500" />;
        case FieldType.CREATED_TIME:
        case FieldType.UPDATED_TIME:
            return <Clock className="h-3.5 w-3.5 text-gray-500" />;
        case FieldType.ID:
        case FieldType.AUTO_NUMBER:
            return <Hash className="h-3.5 w-3.5 text-gray-500" />;
        default:
            return <Type className="h-3.5 w-3.5 text-gray-500" />;
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
}

export const TableView: React.FC<TableViewProps> = (props) => {
    const {
        fields,
        data,
        onAddRecord,
        onUpdateRecord,
        onDeleteRecord,
        editable,
        editor
    } = props;

    const { theme } = useTheme();
    const [selectedRows, setSelectedRows] = useState<ReadonlySet<string>>(new Set());
    const [searchText, setSearchText] = useState('');

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
                    return (
                        <div className="flex items-center h-full py-1">
                            <Renderer value={cellProps.row[field.id]} field={field} />
                        </div>
                    );
                },
                renderEditCell: (editProps: any) => {
                    const Editor = getFieldEditor(field.type);
                    return (
                        <Editor
                            value={editProps.row[field.id]}
                            field={field}
                            onChange={(value: any) => {
                                // 直接更新记录，确保异步操作后也能正确保存
                                const updatedRow = { ...editProps.row, [field.id]: value };
                                editProps.onRowChange(updatedRow, true); // true = commit changes
                                // 同时调用onUpdateRecord确保数据持久化
                                onUpdateRecord(editProps.row.id, updatedRow);
                            }}
                            editor={editor}
                        />
                    );
                }
            }));

        return editable ? [SelectColumn, ...baseColumns] : baseColumns;
    }, [fields, editable]);

    const handleDeleteSelected = () => {
        onDeleteRecord(Array.from(selectedRows));
        setSelectedRows(new Set());
    };

    return (
        <div className="bitable-table-view">
            {/* 工具栏 - 已移到BitableView */}
            {editable && selectedRows.size > 0 && (
                <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 dark:bg-[#252525] border-b border-gray-200 dark:border-[#333]">
                    <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-[#333]"
                        onClick={handleDeleteSelected}
                    >
                        <Trash2 className="h-4 w-4 mr-1" />
                        删除 ({selectedRows.size})
                    </Button>
                    <span className="text-sm text-gray-500">
                        已选择 {selectedRows.size} 项
                    </span>
                </div>
            )}

            {/* 数据表格 */}
            <div className="bitable-grid-container">
                <DataGrid
                    columns={columns}
                    rows={filteredData}
                    rowKeyGetter={(row) => row.id}
                    selectedRows={selectedRows}
                    onSelectedRowsChange={setSelectedRows}
                    onRowsChange={(rows, changes) => {
                        if (changes.indexes.length > 0) {
                            changes.indexes.forEach((index) => {
                                const row: any = rows[index];
                                onUpdateRecord(row.id, row);
                            });
                        }
                    }}
                    className={cn(
                        "bitable-data-grid",
                        theme === 'dark' ? "rdg-dark" : "rdg-light"
                    )}
                    style={{
                        height: 'auto',
                        minHeight: 400,
                        border: 'none'
                    }}
                    rowHeight={40}
                    headerRowHeight={36}
                />
            </div>

            {/* 添加新行按钮 */}
            {editable && (
                <div
                    className="flex items-center gap-2 px-4 py-2 text-gray-500 hover:bg-gray-50 dark:hover:bg-[#252525] cursor-pointer transition-colors border-b border-gray-200 dark:border-[#333]"
                    onClick={onAddRecord}
                >
                    <Plus className="h-4 w-4" />
                    <span className="text-sm">New page</span>
                </div>
            )}

            {/* 自定义样式 */}
            <style>{`
                .bitable-data-grid.rdg-light {
                    --rdg-background-color: #fff;
                    --rdg-header-background-color: #f9fafb;
                    --rdg-row-hover-background-color: #f3f4f6;
                    --rdg-selection-color: #3b82f6;
                    --rdg-border-color: #e5e7eb;
                    --rdg-color: #111827;
                    --rdg-header-color: #6b7280;
                    --rdg-cell-padding-inline: 8px;
                    font-size: 14px;
                }

                .bitable-data-grid.rdg-light .rdg-header-row {
                    background-color: #f9fafb;
                    border-bottom: 1px solid #e5e7eb;
                }

                .bitable-data-grid.rdg-light .rdg-header-row .rdg-cell {
                    border-right: 1px solid #e5e7eb;
                    font-weight: 400;
                }

                .bitable-data-grid.rdg-light .rdg-row {
                    background-color: #fff;
                    border-bottom: 1px solid #f3f4f6;
                }

                .bitable-data-grid.rdg-light .rdg-row:hover {
                    background-color: #f9fafb;
                }

                .bitable-data-grid.rdg-light .rdg-cell {
                    border-right: 1px solid #f3f4f6;
                    padding: 0 8px;
                }

                .bitable-data-grid.rdg-dark {
                    --rdg-background-color: #191919;
                    --rdg-header-background-color: #191919;
                    --rdg-row-hover-background-color: #252525;
                    --rdg-selection-color: #3b82f6;
                    --rdg-border-color: #333;
                    --rdg-color: #fff;
                    --rdg-header-color: #9ca3af;
                    --rdg-cell-padding-inline: 8px;
                    font-size: 14px;
                }

                .bitable-data-grid.rdg-dark .rdg-header-row {
                    background-color: #191919;
                    border-bottom: 1px solid #333;
                }

                .bitable-data-grid.rdg-dark .rdg-header-row .rdg-cell {
                    border-right: 1px solid #333;
                    font-weight: 400;
                }

                .bitable-data-grid.rdg-dark .rdg-row {
                    background-color: #191919;
                    border-bottom: 1px solid #2a2a2a;
                }

                .bitable-data-grid.rdg-dark .rdg-row:hover {
                    background-color: #252525;
                }

                .bitable-data-grid.rdg-dark .rdg-cell {
                    border-right: 1px solid #2a2a2a;
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
            `}</style>
        </div>
    );
};
