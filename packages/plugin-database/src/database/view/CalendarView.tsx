import { NodeViewWrapper } from "@kn/editor";
import React, { useContext, useEffect, useMemo } from "react";
import { Calendar, momentLocalizer } from 'react-big-calendar'
import moment from 'moment'

import "react-big-calendar/lib/css/react-big-calendar.css";
import { NodeViewContext } from "../Context";
import { CalendarClock, Settings, X } from "@kn/icon";

import 'moment/locale/zh-cn';
import { useToggle } from "ahooks";
import { AutoForm, Form, ZodProvider, cn, fieldConfig, z } from "@kn/ui";
import { Button } from "@kn/ui";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Label } from "@kn/ui";
moment.locale('zh-cn');
import "./calendar.css"
import { CalendarProvider } from "./calendar/contexts/calendar-context";
import { ClientContainer } from "./calendar/components/client-container";
import { ChangeBadgeVariantInput } from "./calendar/components/change-badge-variant-input";
import { AppContext } from "@kn/common";
import { GlobalState, useSelector, useUploadFile } from "@kn/core";
const localizer = momentLocalizer(moment) // or globalizeLocalizer



export const CalendarView: React.FC<any> = (props) => {

    const { data, editor, handleAddRow, columns, node, updateAttributes } = useContext(NodeViewContext)
    const { userInfo } = useSelector((state: GlobalState) => state)
    const [visible, { toggle }] = useToggle(false)
    const [flag, { toggle: t }] = useToggle(false)
    const config = node.attrs.viewOptions[props.viewKey] || {}
    const { usePath } = useUploadFile()

    return <NodeViewWrapper className="w-full h-[700px] relative flex flex-col gap-1 text-popover-foreground">
        <div>
            <Button size="sm" variant="ghost" onClick={toggle}><Settings className="h-3 w-3" /></Button>
        </div>
        <CalendarProvider events={[]} users={[
            {
                id: userInfo?.id!,
                name: userInfo?.name!,
                picturePath: usePath(userInfo?.avatar!)
            }
        ]}>
            <ClientContainer />
        </CalendarProvider>
        <div className={cn("absolute p-2 inset-y-0 right-0 h-full w-[250px] border rounded-sm transition ease-in-out bg-popover text-popover-foreground z-50 text-sm ", visible ? " visible slide-in-from-right animate-in fade-in-0 " : " invisible slide-out-to-right animate-out fade-out-0")}>
            <div className=" flex flex-col gap-1" id="config">
                <Label htmlFor="config" className="mb-1 flex flex-row justify-between">配置 <Button size="sm" variant="ghost" onClick={() => toggle()}><X className="h-3 w-3" /></Button></Label>
                <div className="flex flex-row justify-between items-center rounded-sm border hover:bg-muted p-2">
                    显示内容
                    <DropdownMenu>
                        <DropdownMenuTrigger>{config?.titleAccessor?.title || <Settings className="h-4 w-4" />}</DropdownMenuTrigger>
                        <DropdownMenuContent side="right" align="start">
                            {columns && columns.map((column: any, index: number) => (
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
                            {columns && columns.map((column: any, index: number) => (
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
                            {columns && columns.map((column: any, index: number) => (
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