import { ArrowRight, Edit2, Filter, List, LockIcon, Plus, SortDesc, SquareStack, Trash2, XCircle } from "@repo/icon"
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, Input, Label, Separator, cn } from "@repo/ui"
import React, { useContext, useState } from "react"
import { NodeViewContext } from "../DatabaseView"


export const TableViewCfg = (props: { visible: boolean, toggle: () => void }) => {
    const { visible, toggle } = props
    const { columns, columnTypes, handleAddCol, deleteNode, handleDelCol } = useContext(NodeViewContext)
    const [fieldName, setFieldName] = useState<string>()

    return <div
        className={cn("absolute p-1 inset-y-0 right-0 w-[250px] border rounded-sm transition ease-in-out bg-popover text-popover-foreground z-50 text-sm shadow-sm ", visible ? " visible slide-in-from-right animate-in fade-in-0 " : " invisible slide-out-to-right animate-out fade-out-0")}
        onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
        }}
    >
        <div className="flex flex-col gap-1" id="container">
            <Label className="mb-1 font-bold p-2 flex justify-between items-center">表格设置 <XCircle className="h-4 w-4 cursor-pointer" onClick={toggle} /></Label>
            <Separator />
            <DropdownMenu>
                <DropdownMenuTrigger asChild >
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
                                    columnTypes && columnTypes.map((type, index) => (
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
                    <LockIcon className="h-4 w-4" />
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
}