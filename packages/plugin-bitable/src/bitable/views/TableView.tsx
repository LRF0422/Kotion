import React, { useState, useMemo } from "react";
import { Button, Input } from "@kn/ui";
import { Plus, Search, Settings, Trash2 } from "@kn/icon";
import { FieldConfig, RecordData, ViewConfig } from "../../types";
import DataGrid, { SelectColumn } from 'react-data-grid';
import 'react-data-grid/lib/styles.css';
import { useTheme, cn } from "@kn/ui";
import { getFieldRenderer, getFieldEditor } from "../fields/FieldRenderers";

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
}

export const TableView: React.FC<TableViewProps> = (props) => {
    const {
        fields,
        data,
        onAddRecord,
        onUpdateRecord,
        onDeleteRecord,
        editable
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
                width: field.width || 150,
                resizable: true,
                sortable: true,
                editable: editable && field.type !== 'id',
                renderCell: (props: any) => {
                    const Renderer = getFieldRenderer(field.type);
                    return <Renderer value={props.row[field.id]} field={field} />;
                },
                renderEditCell: (props: any) => {
                    const Editor = getFieldEditor(field.type);
                    return (
                        <Editor
                            value={props.row[field.id]}
                            field={field}
                            onChange={(value: any) => {
                                onUpdateRecord(props.row.id, { [field.id]: value });
                            }}
                        />
                    );
                }
            }));

        return editable ? [SelectColumn, ...baseColumns] : baseColumns;
    }, [fields, editable, onUpdateRecord]);

    const handleDeleteSelected = () => {
        onDeleteRecord(Array.from(selectedRows));
        setSelectedRows(new Set());
    };

    return (
        <div className="space-y-4">
            {/* 工具栏 */}
            {editable && (
                <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={onAddRecord}>
                        <Plus className="h-4 w-4 mr-1" />
                        添加行
                    </Button>
                    {selectedRows.size > 0 && (
                        <>
                            <Button size="sm" variant="outline" onClick={handleDeleteSelected}>
                                <Trash2 className="h-4 w-4 mr-1" />
                                删除 ({selectedRows.size})
                            </Button>
                            <span className="text-sm text-muted-foreground">
                                已选择 {selectedRows.size} 项
                            </span>
                        </>
                    )}
                    <div className="flex-1" />
                    <Input
                        className="w-64 h-9"
                        placeholder="搜索..."
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                    />
                </div>
            )}

            {/* 数据表格 */}
            <div className={cn("rdg-wrapper", theme === 'dark' ? 'rdg-dark' : 'rdg-light')}>
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
                    className="fill-grid"
                    style={{ height: 'auto', minHeight: 400 }}
                />
            </div>
        </div>
    );
};
