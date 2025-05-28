import { Button } from "@repo/ui";
import { NodeViewProps } from "@tiptap/core";
import { NodeViewWrapper } from "@tiptap/react";
import React, { createContext, ElementType, useCallback, useEffect, useRef, useState } from "react";
import { TableView } from "./view/TableView";
import { addCol, addRow, deleteColV2, getDatabaseData, moveCol, removeRow, updateCellData, updateCellDataV2, UpdateCellProps } from "./utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui";
import { Calendar, ChartArea, CheckSquare, Image, Kanban, Link2, MoreVertical, Plus, SlidersIcon, Star, StarIcon, Table2, TagIcon, Text, TimerIcon, Trash2, TypeIcon } from "@repo/icon";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger } from "@repo/ui";
import { cloneDeep } from "lodash";
import { ChartView } from "./view/ChartView";
import { CalendarView } from "./view/CalendarView";



export type ColumnType = {
    label: string
    value: string
    icon: ElementType
}

const allColumnType: ColumnType[] = [
    {
        label: '文字',
        value: 'text',
        icon: Text
    },
    {
        label: '日期',
        value: 'date-picker-cell',
        icon: Calendar
    },
    {
        label: '评分',
        value: 'star-cell',
        icon: Star
    },
    {
        label: '图片',
        value: 'image',
        icon: Image
    },
    {
        label: 'Markdown',
        value: 'markdown',
        icon: TypeIcon
    },
    {
        label: 'Slider',
        value: 'slider',
        icon: SlidersIcon
    },
    {
        label: 'Checkbox',
        value: 'checkbox',
        icon: CheckSquare
    },
    {
        label: 'Rate',
        value: 'rate',
        icon: StarIcon
    },
    {
        label: 'Select',
        value: 'select',
        icon: TagIcon
    },
    {
        label: 'PageLink',
        value: 'pageLink',
        icon: Link2
    }
]

export type Context = NodeViewProps & {
    data: any[],
    handleAddRow: (data?: any) => void,
    handleAddCol: (column: any) => void,
    handleDelCol: (columnIndex: number) => void,
    handleDataChange: (row: number, col: number, data: any) => void,
    handleDataChangeBatch: (updateCells: UpdateCellProps[]) => void,
    handleMoveCol: (source: string, target: string) => void,
    handleDeleteRow: (rowIndex: string[]) => void,
    columns: any[], columnTypes: ColumnType[]
}

export const NodeViewContext = createContext<Context>({} as Context)

export const DatabaseView: React.FC<NodeViewProps> = (props) => {

    const [data, setData] = useState<any[]>([])
    const columnsRef = useRef<any[]>(props.node.attrs.columns)

    useEffect(() => {
        setData(getDatabaseData(props.node))
        columnsRef.current = props.node.attrs.columns
    }, [props])

    const doUpdate = () => {
        props.updateAttributes({
            ...props.node.attrs,
            updateFlag: props.node.attrs.updateFlag + 1
        })
    }

    const doAddRow = useCallback((data?: any) => {
        addRow(props.editor, props.editor.state, props.editor.view, props.node, props.getPos(), data)
        doUpdate()
    }, [props])

    const onDataChange = useCallback((row: number, col: number, data: any) => {
        updateCellData(props.editor.state, props.editor.view, props.node, props.getPos(), col, row, data)
        doUpdate()
    }, [props])

    const doDelCol = useCallback((colIndex: number) => {
        deleteColV2(props.editor.state, props.editor.view, props.node, props.getPos(), colIndex)
        doUpdate()
    }, [props])

    const doMoveCol = useCallback((source: string, target: string) => {
        const columns = props.node.attrs.columns as any[]
        const sourceItem = columns.find(it => it.id === source)
        const targetItem = columns.find(it => it.id === target)
        columns.forEach((it, index) => {
            if (it.id === source) {
                columns[index] = targetItem
            }
            if (it.id === target) {
                columns[index] = sourceItem
            }
        })
        const cols = [
            ...columns
        ]
        const newVal = {
            ...props.node?.attrs,
            columns: cols
        }
        moveCol(props.editor.state, props.editor.view, props.node, props.getPos(), source, target, newVal)
        // props.updateAttributes(newVal)
    }, [props])

    const doDeleteRow = useCallback((rowIndex: string[]) => {
        removeRow(props.editor, props.editor.state, props.editor.view, props.node, props.getPos(), rowIndex)
        doUpdate()
    }, [props])

    const doUpdateCellBatch = useCallback((updateCells: UpdateCellProps[]) => {
        updateCellDataV2(props.editor.state, props.editor.view, props.node, props.getPos(), updateCells)
        doUpdate()
    }, [props])

    const onUpdateColumnSize = useCallback((columnIndex: number, newSize: number) => {
        const columns = props.node.attrs.columns
        columns[columnIndex].width = newSize
        props.updateAttributes({
            ...props.node.attrs,
            columns: columns
        })
    }, [props])

    const handleAddColumn = useCallback((column: any) => {
        const cols = [
            ...props.node.attrs.columns,
            column
        ]
        const newVal = {
            ...props.node?.attrs,
            columns: cols
        }
        props.updateAttributes(newVal)
        addCol(props.editor.state, props.editor.view, props.node, props.getPos(), column)
    }, [props.node])

    const getContent = (view: string) => {
        switch (view) {
            case 'table':
                return <TableView viewKey={view} />
            case 'chart':
                return <ChartView viewKey={view} />
            case 'calendar':
                return <CalendarView  />
            default:
                return <TableView viewKey={view} />
        }
    }

    const getIcon = useCallback((v: string) => {
        if (v) {
            switch (v) {
                case 'table':
                    // @ts-ignore
                    return <TableView.Icon className="h-4 w-4" />
                case 'chart':
                    // @ts-ignore
                    return <ChartView.Icon className="h-4 w-4" />
                case 'calendar':
                    // @ts-ignore
                    return <CalendarView.Icon className="h-4 w=4" />
                default:
                    // @ts-ignore
                    return <TableView.Icon className="h-4 w-4" />
            }
        }
        return <></>
    }, [])

    const handleAddView = useCallback(() => {
        const views = cloneDeep(props.node.attrs.views)
        views.push("chart")
        props.updateAttributes({
            ...props.node.attrs,
            views: views
        })
        console.log('changed views', props);

    }, [props])

    const handleRemoveView = (key: string) => {
        props.updateAttributes({
            ...props.node.attrs,
            views: props.node.attrs.views.filter((it: string) => it !== key)
        })
    }

    return <NodeViewWrapper className="leading-normal" contentEditable={false} >
        <NodeViewContext.Provider value={{
            ...props,
            data: data,
            handleAddRow: doAddRow,
            handleAddCol: handleAddColumn,
            handleDelCol: doDelCol,
            handleMoveCol: doMoveCol,
            handleDataChange: onDataChange,
            handleDeleteRow: doDeleteRow,
            handleDataChangeBatch: doUpdateCellBatch,
            columns: [...props.node.attrs.columns], columnTypes: allColumnType
        }} >
            <div className="h-min-[300px] w-full rounded-md">
                <Tabs defaultValue="table" className="min-h-[300px]">
                    <div className="flex justify-between">
                        <TabsList className="">
                            <div className="flex flex-row items-center">
                                <div>
                                    {props.node.attrs.views && props.node.attrs.views.map((v: string, index: number) => (
                                        <TabsTrigger value={v} key={index} className="">
                                            <div className="flex flex-row gap-1 items-center">
                                                {getIcon(v)}
                                                <div>
                                                    {v}
                                                </div>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger onClick={(e) => {
                                                        e.stopPropagation()
                                                        e.preventDefault()
                                                    }}><MoreVertical className="h-3 w-3" /></DropdownMenuTrigger>
                                                    <DropdownMenuContent side="bottom" align="center" sideOffset={10} className="w-[200px]">
                                                        <DropdownMenuItem className="p-1">
                                                            Rename
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem className="p-1" onClick={() => {
                                                            handleRemoveView(v)
                                                        }}>
                                                            Remove
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </div>
                                        </TabsTrigger>
                                    ))}
                                </div>
                                <DropdownMenu>
                                    <DropdownMenuTrigger><Button variant="ghost" size="icon" ><Plus className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                    <DropdownMenuContent className="w-[300px]">
                                        <DropdownMenuLabel>新建视图</DropdownMenuLabel>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem onClick={handleAddView} className="flex flex-row items-center gap-2">
                                            <Table2 className="h-4 w-4" />
                                            <span>Table View</span>
                                        </DropdownMenuItem>
                                        <DropdownMenuItem className="flex flex-row items-center gap-2">
                                            <TimerIcon className="h-4 w-4" />
                                            <span>TimeLine View</span>
                                            <DropdownMenuShortcut></DropdownMenuShortcut>
                                        </DropdownMenuItem>
                                        <DropdownMenuItem className="flex flex-row items-center gap-2">
                                            <ChartArea className="h-4 w-4" />
                                            <span>Chart View</span>
                                        </DropdownMenuItem>
                                        <DropdownMenuItem className="flex flex-row items-center gap-2">
                                            <Kanban className="h-4 w-4" />
                                            <span>Kanban View</span>
                                        </DropdownMenuItem>
                                        <DropdownMenuItem className="flex flex-row items-center gap-2">
                                            <Calendar className="h-4 w-4" />
                                            <span>Calendar View</span>
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        </TabsList>
                        <div>
                            <Button size="sm" variant="ghost" onClick={() => props.deleteNode()}><Trash2 className="w-4 h-4" /></Button>
                        </div>
                    </div>
                    {
                        props.node.attrs.views && props.node.attrs.views.map((v: string, index: number) => (
                            <TabsContent value={v} key={index}>
                                {getContent(v)}
                            </TabsContent>
                        ))
                    }
                </Tabs>
            </div>
        </NodeViewContext.Provider>
    </NodeViewWrapper>
}