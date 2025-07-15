import { NodeViewWrapper } from "@tiptap/react";
import React, { useContext, useEffect, useMemo } from "react";
import { Calendar, momentLocalizer } from 'react-big-calendar'
import moment from 'moment'

import "react-big-calendar/lib/css/react-big-calendar.css";
import { NodeViewContext } from "../DatabaseView";
import { CalendarClock, Settings, X } from "@repo/icon";

import 'moment/locale/zh-cn';
import { useToggle } from "ahooks";
import { AutoForm, Form, ZodProvider, cn, fieldConfig, z } from "@repo/ui";
import { Button } from "@repo/ui";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Label } from "@repo/ui";
moment.locale('zh-cn');
import "./calendar.css"
// import { useModal } from "@re";
const localizer = momentLocalizer(moment) // or globalizeLocalizer



export const CalendarView: React.FC<any> = (props) => {

    const { data, editor, handleAddRow, columns, node, updateAttributes } = useContext(NodeViewContext)
    const [visible, { toggle }] = useToggle(false)
    const [flag, { toggle: t }] = useToggle(false)
    const config = node.attrs.viewOptions[props.viewKey] || {}
    // const { openModal, closeModal } = useModal()

    const { defaultDate } = useMemo(() => ({
        defaultDate: new Date()
    }), [])

    const mySchema = z.object({
        name: z.string().superRefine(
            fieldConfig({
                label: '事件名称'
            })
        ),
        startDate: z.date().superRefine(
            fieldConfig({
                label: '开始时间'
            })
        ),
        endDate: z.date().superRefine(
            fieldConfig({
                label: '结束时间'
            })
        ),
        people: z.enum(["张三", "李四", "王五"]).superRefine(
            fieldConfig({
                label: '执行人'
            })
        ),
        color: z.string().superRefine(
            fieldConfig({
                label: '颜色',
                fieldType: 'color'
            })
        ),
    });
    const schemaProvider = new ZodProvider(mySchema);

    return <NodeViewWrapper className="w-full h-[700px] relative flex flex-col gap-1 text-popover-foreground">
        <div>
            <Button size="sm" variant="ghost" onClick={toggle}><Settings className="h-3 w-3" /></Button>
        </div>
        <Calendar
            messages={{
                today: "今日",
                next: "前进",
                previous: "后退",
                month: "月",
                week: "周",
                day: "日",
                agenda: "日程表",
            }}
            components={{
            }}
            defaultDate={defaultDate}
            localizer={localizer}
            events={data}
            showMultiDayTimes
            selectable={editor.isEditable}
            onSelectSlot={(info) => {
                if (info.action === "select") {
                    console.log('info', info);
                    // openModal({
                    //     title: '新增事件',
                    //     height: 'auto',
                    //     content: <div className=" p-2">
                    //         <AutoForm
                    //             schema={schemaProvider}
                    //             withSubmit
                    //             onSubmit={() => {
                    //                 handleAddRow({
                    //                     test2: info.start.toISOString(),
                    //                     test3: info.end.toISOString(),
                    //                     test: "Test"
                    //                 })
                    //                 closeModal()
                    //             }}
                    //         />
                    //     </div>
                    // })
                }
            }}
            titleAccessor={(e) => {
                if (config.titleAccessor) {
                    return e[config.titleAccessor.id]
                }
                return ""
            }}
            startAccessor={(e) => {
                if (config.startAccessor) {
                    return new Date(e[config.startAccessor.id])
                }
                return new Date()
            }}
            endAccessor={(e) => {
                if (config.endAccessor) {
                    return new Date(e[config.endAccessor.id])
                }
                return new Date()
            }}
        />
        <div className={cn("absolute p-2 inset-y-0 right-0 h-full w-[250px] border rounded-sm transition ease-in-out bg-popover text-popover-foreground z-50 text-sm ", visible ? " visible slide-in-from-right animate-in fade-in-0 " : " invisible slide-out-to-right animate-out fade-out-0")}>
            <div className=" flex flex-col gap-1" id="config">
                <Label htmlFor="config" className="mb-1 flex flex-row justify-between">配置 <Button size="sm" variant="ghost" onClick={() => toggle()}><X className="h-3 w-3" /></Button></Label>
                <div className="flex flex-row justify-between items-center rounded-sm border hover:bg-muted p-2">
                    显示内容
                    <DropdownMenu>
                        <DropdownMenuTrigger>{config?.titleAccessor?.title || <Settings className="h-4 w-4" />}</DropdownMenuTrigger>
                        <DropdownMenuContent side="right" align="start">
                            {columns && columns.map((column, index) => (
                                <DropdownMenuItem onClick={() => {
                                    config.titleAccessor = column
                                    updateAttributes({
                                        ...node.attrs,
                                        viewOptions: {
                                            ...node.attrs.viewOptions,
                                            [props.viewKey]: { ...config }
                                        }
                                    })
                                    t()
                                }} key={index}>{column.title}</DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
                <div className="flex flex-row justify-between items-center rounded-sm border hover:bg-muted p-2">
                    开始时间
                    <DropdownMenu>
                        <DropdownMenuTrigger>{config?.startAccessor?.title || <Settings className="h-4 w-4" />}</DropdownMenuTrigger>
                        <DropdownMenuContent side="right" align="start">
                            {columns && columns.map((column, index) => (
                                <DropdownMenuItem onClick={() => {
                                    config.startAccessor = column
                                    updateAttributes({
                                        ...node.attrs,
                                        viewOptions: {
                                            ...node.attrs.viewOptions,
                                            [props.viewKey]: { ...config }
                                        }
                                    })
                                    t()
                                }} key={index}>{column.title}</DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
                <div className="flex flex-row justify-between items-center rounded-sm border hover:bg-muted p-2">
                    结束时间
                    <DropdownMenu>
                        <DropdownMenuTrigger>{config?.endAccessor?.title || <Settings className="h-4 w-4" />}</DropdownMenuTrigger>
                        <DropdownMenuContent side="right" align="start">
                            {columns && columns.map((column, index) => (
                                <DropdownMenuItem onClick={() => {
                                    config.endAccessor = column
                                    updateAttributes({
                                        ...node.attrs,
                                        viewOptions: {
                                            ...node.attrs.viewOptions,
                                            [props.viewKey]: { ...config }
                                        }
                                    })
                                    t() // rerender the page
                                }} key={index}>{column.title}</DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>
        </div>
    </NodeViewWrapper>
}

// @ts-ignore
CalendarView.Icon = CalendarClock