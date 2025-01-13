import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@repo/ui";
import { Input } from "@repo/ui";
import { GridColumn } from "@glideapps/glide-data-grid"
import { ArrowRight, Edit2, Edit3, Filter, List, Lock, MoreHorizontal, Plus, Settings, SortDesc, SquareStack, Table, Trash2, XCircle } from "@repo/icon";
import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { NodeViewContext } from "../DatabaseView";
import { Button } from "@repo/ui";
import 'react-data-grid/lib/styles.css';

import DataGrid, { DataGridHandle, FillEvent, textEditor } from 'react-data-grid';

import { useToggle } from "ahooks";
import { cn } from "@repo/ui";
import { Label } from "@repo/ui";
import { Separator } from "@repo/ui";
import { DateColumnEditor, getCellIcon, getCellView, getEditor } from "./custom-columns/DateColumns";
import styled from "styled-components";
import { createPortal } from "react-dom";
import { findDomRefAtPos } from "prosemirror-utils";
import { useTheme } from "@repo/ui";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuShortcut, ContextMenuTrigger } from "@repo/ui";
import { UpdateCellProps } from "../utils";
import React from "react";

export interface TableViewProps {
    columns: GridColumn[]
    options?: any
    data: any[]
    viewKey: string
    onDataChange?: (row: number, col: number, data: any) => void
    onRowAppended?: () => void
    onColumnResize?: (colIndex: number, newSize: number) => void
}


const Container = styled.div`
    .rdg-cell {
        border: 1px solid #eee
    }
`

export const TableView: React.FC<TableViewProps> = (props) => {

    const { onDataChange, onRowAppended } = props
    const { theme } = useTheme()
    const { editor, columns, columnTypes, handleAddCol, data, deleteNode, handleDelCol, handleMoveCol, node, updateAttributes, handleDeleteRow, handleDataChangeBatch, getPos } = useContext(NodeViewContext)
    const [visible, { toggle }] = useToggle(false)
    const [fieldName, setFieldName] = useState<string>()
    const gridRef = useRef<DataGridHandle>(null);
    const gridContainerRef = useRef<any>(null);
    const [contextMenuProps, setContextMenuProps] = useState<{
        rowIdx: number;
        top: number;
        left: number;
    } | null>(null);

    useEffect(() => {
        console.log('columns Change', columns);

    }, [columns])

    useEffect(() => {
        console.log('data Change', data);

    }, [data])

    function handleFill({ columnKey, sourceRow, targetRow }: FillEvent<any>): any {
        return { ...targetRow, [columnKey]: sourceRow[columnKey as keyof any] };
    }

    const handleReorder = (sourceKey: string, targetKey: string) => {
        handleMoveCol && handleMoveCol(sourceKey, targetKey)
    }

    const summaryRows = useMemo((): readonly any[] => {
        return [
            {
                id: 'total_0',
                Test: data.length
            }
        ];
    }, [data]);

    const handleColumnResize = (index: number, width: number) => {
        columns[index].width = width
        updateAttributes({
            ...node.attrs,
            columns: columns
        })
    }

    return <div className=" relative">
        <Button size="sm" onClick={toggle}><Settings className="h-3 w-3" /></Button>
        <Button size="sm" onClick={onRowAppended}><Plus className="h-3 w-3" /></Button>
        <ContextMenu onOpenChange={() => {
            console.log('contextProps', contextMenuProps);
        }}>
            <ContextMenuTrigger disabled={!editor.isEditable}>
                <Container ref={gridContainerRef}>
                    <DataGrid
                        ref={gridRef}
                        rowClass={() => ''}
                        onFill={handleFill}
                        rowKeyGetter={(row) => row.id}
                        // @ts-ignore
                        columns={columns.map((it, index) => ({
                            name: it.title,
                            key: it.id,
                            width: it.width || 150,
                            renderEditCell: getEditor(it.dataType),
                            renderCell: getCellView(it.dataType),
                            editable: editor.isEditable,
                            resizable: true,
                            draggable: editor.isEditable && it.dataType !== 'id',
                            renderSummaryCell: () => {
                                return it.dataType === 'id' && <div className=" w-full h-full flex flex-row gap-1 items-center text-gray-500 cursor-pointer" onClick={() => {
                                    onRowAppended && onRowAppended()
                                    gridRef.current && gridRef.current.scrollToCell({ rowIdx: data.length - 1 })
                                }}>
                                    <Plus className=" h-4 w-4" />
                                    Add New Row
                                </div>;
                            },
                            renderHeaderCell: ({ column }) => <div className="flex flex-row gap-1 items-center justify-between">
                                <div className="flex flex-row gap-1 items-center">
                                    {getCellIcon(it.dataType)}
                                    {column.name}
                                </div>
                                {
                                    it.dataType !== 'id' && editor.isEditable && <DropdownMenu>
                                        <DropdownMenuTrigger><MoreHorizontal className="h-4 w-4" /></DropdownMenuTrigger>
                                        <DropdownMenuContent className="w-[200px]">
                                            <DropdownMenuItem className="flex flex-row gap-1 items-center">
                                                <Edit3 className="h-4 w-4" />重命名
                                            </DropdownMenuItem>
                                            <DropdownMenuItem className="flex flex-row gap-1 items-center" onClick={() => handleDelCol(index)}>
                                                <Trash2 className="h-4 w-4" />删除
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                }
                            </div>
                        }))}
                        className={cn("fill-grid", theme === 'dark' ? 'rdg-dark' : 'rdg-light')}
                        rows={data}
                        onColumnResize={handleColumnResize}
                        bottomSummaryRows={editor.isEditable ? summaryRows : undefined}
                        onColumnsReorder={handleReorder}
                        onCellContextMenu={({ row }, event) => {
                            event.preventGridDefault();
                            event.preventDefault();
                            setContextMenuProps({
                                rowIdx: data.indexOf(row),
                                top: event.clientY,
                                left: event.clientX
                            });
                        }}
                        onRowsChange={(rows, data) => {
                            if (data.indexes.length > 0) {
                                const updateCells: UpdateCellProps[] = data.indexes.map(index => {
                                    const d = rows[index]
                                    // onDataChange && onDataChange(index, data.column.idx, d[data.column.key])
                                    return {
                                        colIndex: data.column.idx,
                                        rowIndex: index,
                                        data: d[data.column.key]
                                    }
                                })
                                handleDataChangeBatch(updateCells)
                            }
                        }}
                    />
                </Container>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-[200px]">
                <ContextMenuItem onClick={() => {
                    if (contextMenuProps) {
                        handleDeleteRow(contextMenuProps?.rowIdx)
                    }
                }} className="flex flex-row gap-1">
                    <Trash2 className="h-4 w-4" />删除
                    <ContextMenuShortcut>Del</ContextMenuShortcut>
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
        <div id="portal" className=" left-0 top-0 z-[9999] fixed" />
        <div className={cn("absolute p-1 inset-y-0 right-0 w-[250px] border rounded-sm transition ease-in-out bg-popover text-popover-foreground z-50 text-sm shadow-sm ", visible ? " visible slide-in-from-right animate-in fade-in-0 " : " invisible slide-out-to-right animate-out fade-out-0")}>
            <div className="flex flex-col gap-1" id="container">
                <Label className="mb-1 font-bold p-2 flex justify-between items-center">表格设置 <XCircle className="h-4 w-4 cursor-pointer" onClick={toggle} /></Label>
                <Separator />
                <DropdownMenu>
                    <DropdownMenuTrigger>
                        <div className="full p-2 rounded-sm hover:bg-muted flex flex-row justify-between items-center">
                            <div className="flex flex-row gap-1 items-center">
                                <List className="h-4 w-4" />
                                <span>字段</span>
                            </div>
                            <ArrowRight className="h-4 w-4" />
                        </div>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="right" align="start" className="w-[150px]">
                        <div className=" text-sm flex flex-row items-center justify-between gap-1">
                            已添加字段
                            <DropdownMenu>
                                <DropdownMenuTrigger><Button variant="ghost" size="sm"> <Plus className="h-3 w-3" /></Button></DropdownMenuTrigger>
                                <DropdownMenuContent side="right" align="start" className="w-[150px]">
                                    <div>
                                        <Label htmlFor="fieldName">名称</Label>
                                        <Input className="h-7" onChange={(e) => setFieldName(e.target.value)} id="fieldName" />
                                    </div>
                                    <DropdownMenuSeparator />
                                    {
                                        columnTypes.map((type, index) => (
                                            <DropdownMenuItem key={index} className="flex flex-row gap-1" onClick={() => {
                                                if (fieldName) {
                                                    handleAddCol({
                                                        title: fieldName,
                                                        id: fieldName,
                                                        dataType: type.value
                                                    })
                                                }
                                            }}>
                                                <type.icon className="h-4 w-4" /> {type.label}
                                            </DropdownMenuItem>
                                        ))
                                    }
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                        <DropdownMenuSeparator />
                        {columns && columns.map((column, index) => (
                            <DropdownMenuItem key={index} className="flex flex-row justify-between items-center">
                                {column.title}
                                <div className="flex flex-row gap-1 items-center">
                                    <Edit2 className="h-3 w-3" />
                                    <Trash2 className="h-3 w-3" onClick={() => handleDelCol(index)} />
                                </div>
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu>
                    <DropdownMenuTrigger>
                        <div className="full p-2 rounded-sm hover:bg-muted flex flex-row justify-between items-center">
                            <div className="flex flex-row gap-1 items-center">
                                <Filter className="h-4 w-4" />
                                <span>过滤</span>
                            </div>
                            <ArrowRight className="h-4 w-4" />
                        </div>
                    </DropdownMenuTrigger>
                </DropdownMenu>
                <DropdownMenu>
                    <DropdownMenuTrigger>
                        <div className="full p-2 rounded-sm hover:bg-muted flex flex-row justify-between items-center">
                            <div className="flex flex-row gap-1 items-center">
                                <SortDesc className="h-4 w-4" />
                                <span>排序</span>
                            </div>
                            <ArrowRight className="h-4 w-4" />
                        </div>
                    </DropdownMenuTrigger>
                </DropdownMenu>
                <Separator />
                <div className="full p-2 rounded-sm hover:bg-muted flex flex-row justify-between items-center">
                    <div className="flex flex-row gap-1 items-center">
                        <SquareStack className="h-4 w-4" />
                        <span>远程数据</span>
                    </div>
                </div>
                <Separator />
                <div className="full p-2 rounded-sm hover:bg-muted flex flex-row justify-between items-center">
                    <div className="flex flex-row gap-1 items-center">
                        <Lock className="h-4 w-4" />
                        <span>锁定</span>
                    </div>
                </div>
                <div onClick={deleteNode} className="full p-2 rounded-sm hover:bg-muted flex flex-row justify-between items-center">
                    <div className="flex flex-row gap-1 items-center">
                        <Trash2 className="h-4 w-4" />
                        <span>移除</span>
                    </div>
                </div>
            </div>
        </div>
    </div>
}
// @ts-ignore
TableView.Icon = Table