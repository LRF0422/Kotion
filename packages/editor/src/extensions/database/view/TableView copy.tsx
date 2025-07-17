import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@kn/ui";
import { Input } from "@kn/ui";
import { GridColumn, DataEditor, Item, GridCellKind } from "@glideapps/glide-data-grid"
import "@glideapps/glide-data-grid/dist/index.css";
import { ArrowRight, Edit2, Filter, List, Lock, Plus, Settings, SortDesc, SquareStack, Table, Trash2 } from "@kn/icon";
import { useCallback, useContext, useState } from "react";
import { NodeViewContext } from "../DatabaseView";
import { Button } from "@kn/ui";
import {
    StarCell, StarCellType,
    DatePickerCell, DatePickerType,
    MultiSelectCell,
    TagsCell
} from "@glideapps/glide-data-grid-cells"
import { useToggle } from "ahooks";
import { cn } from "@kn/ui";
import { Label } from "@kn/ui";
import { Separator } from "@kn/ui";
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

export const TableView: React.FC<TableViewProps> = (props) => {

    const { onDataChange } = props
    const { editor, columns, columnTypes, handleAddCol, data, deleteNode } = useContext(NodeViewContext)
    const [visible, { toggle }] = useToggle(false)
    const [fieldName, setFieldName] = useState<string>()

    const getData = useCallback(([col, row]: Item): any => {
        const item = data[row];
        const column = columns[col]

        switch (column.dataType) {
            case 'text':
                return {
                    kind: GridCellKind.Text,
                    allowOverlay: true,
                    readonly: !editor.isEditable,
                    data: item[`${columns[col].id}`] || '',
                    displayData: item[`${columns[col].id}`] || '',
                }
            case 'id':
                return {
                    kind: GridCellKind.RowID,
                    data: item[`${columns[col].id}`] || '',
                    allowOverlay: true,
                }
            case 'date-picker-cell':
                return {
                    kind: GridCellKind.Custom,
                    allowOverlay: true,
                    copyData: "4",
                    readonly: !editor.isEditable,
                    data: {
                        kind: "date-picker-cell",
                        date: (item[columns[col].id] && new Date(item[columns[col].id])) || new Date(),
                        displayDate: item[columns[col].id] || new Date().toISOString(),
                        format: "datetime-local",
                    },
                }
            case 'star-cell':
                return {
                    kind: GridCellKind.Custom,
                    allowOverlay: true,
                    readonly: !editor.isEditable,
                    copyData: "4",
                    data: {
                        kind: "star-cell",
                        label: "Test",
                        rating: 4,
                    },
                } as StarCellType
            case 'image':
                return {
                    kind: GridCellKind.Image,
                    allowOverlay: true,
                    readonly: false,
                    data: item[columns[col].id] || []
                }
            default:
                return {
                    kind: GridCellKind.Text,
                    allowOverlay: true,
                    readonly: !editor.isEditable,
                    data: item[`${columns[col].id}`] || '',
                    displayData: item[`${columns[col].id}`] || '',
                }
        }
    }, [columns, data])

    const onCellEdited = (cell: Item, newValue: any) => {
        console.log('data', newValue);

        const [col, row] = cell;
        let data;
        if (newValue.kind === GridCellKind.Custom) {
            if (newValue.data.kind === "date-picker-cell") {
                newValue as DatePickerType
                data = (newValue as DatePickerType)?.data?.date?.toISOString()
            }
        } else {
            data = newValue.data
        }
        console.log('data', data);

        onDataChange && onDataChange(row, col, data)
    }

    const resize = (column: GridColumn, newSize: number, colIndex: number, newSizeWithGrow: number) => {
        console.log('resizing', newSize);
        // props.onColumnResize && props.onColumnResize(colIndex, newSize)
    }

    return <div className=" relative">
        <Button size="sm" onClick={toggle}><Settings className="h-3 w-3" /></Button>
        <DataEditor
            onCellEdited={onCellEdited}
            columns={columns}
            rows={props.data.length}
            getCellContent={getData}
            width="100%"
            height="500px"
            rowMarkers={"both"}
            onColumnResize={resize}
            maxColumnAutoWidth={500}
            maxColumnWidth={2000}
            scaleToRem={true}
            fillHandle={true}
            keybindings={{ search: true }}
            getCellsForSelection={true}
            onPaste={true}
            theme={{
                bgHeader: "#fff",
            }}
            customRenderers={[StarCell, DatePickerCell, MultiSelectCell, TagsCell]}
            trailingRowOptions={editor.isEditable ? {
                // How to get the trailing row to look right
                sticky: false,
                tint: true,
                hint: "New row..."
            } : undefined}
            onRowAppended={editor.isEditable ? props.onRowAppended : undefined}
        />
        <div id="portal" className=" left-0 top-0 z-[9999] fixed" />
        <div className={cn("absolute p-1 inset-y-0 right-0 h-full w-[250px] border rounded-sm transition ease-in-out bg-white z-50 text-sm shadow-sm ", visible ? " visible slide-in-from-right animate-in fade-in-0 " : " invisible slide-out-to-right animate-out fade-out-0")}>
            <div className="flex flex-col gap-1" id="container">
                <Label className="mb-1 font-bold p-2">表格设置</Label>
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
                                    <Trash2 className="h-3 w-3" />
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