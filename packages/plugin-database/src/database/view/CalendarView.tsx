import { NodeViewWrapper } from "@kn/editor";
import React, { useCallback, useContext } from "react";
import moment from 'moment'

import "react-big-calendar/lib/css/react-big-calendar.css";
import { NodeViewContext } from "../Context";
import { CalendarClock, Settings, X } from "@kn/icon";

import 'moment/locale/zh-cn';
import { useToggle } from "ahooks";
import { cn } from "@kn/ui";
import { Button } from "@kn/ui";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Label } from "@kn/ui";
moment.locale('zh-cn');
import "./calendar.css"
import { CalendarProvider } from "./calendar/contexts/calendar-context";
import { ClientContainer } from "./calendar/components/client-container";
import { GlobalState, useSelector, useUploadFile } from "@kn/core";
import { IEvent } from "./calendar/interfaces";

function isValidDate(dateString: string): boolean {
    const timestamp = Date.parse(dateString);
    return !isNaN(timestamp);
}

export const CalendarView: React.FC<any> = (props) => {

    const { data, editor, handleAddRow, columns, node, updateAttributes } = useContext(NodeViewContext)
    const { userInfo } = useSelector((state: GlobalState) => state)
    const [visible, { toggle }] = useToggle(false)
    const config = node.attrs.viewOptions[props.viewKey] || {}

    const { usePath } = useUploadFile()

    const resloveData = useCallback((): IEvent[] => {

        console.log('config', config);
        if (Object.keys(config).length === 0) {
            return []
        }

        return data.map(it => {
            const res: IEvent = ({
                id: it.id,
                title: config.titleAccessor ? it[config.titleAccessor.id] : "",
                description: config.descAccessor ? it[config.descAccessor.id] : "",
                startDate: config.startAccessor ? (isValidDate(it[config.startAccessor.id] + "") ? it[config.startAccessor.id] : new Date().toISOString()) : new Date().toISOString(),
                endDate: config.endAccessor ? (isValidDate(it[config.endAccessor.id] + "") ? it[config.endAccessor.id] : new Date().toISOString()) : new Date().toISOString(),
                color: "red",
                user: {
                    id: userInfo?.id!,
                    name: userInfo?.name!,
                    picturePath: usePath(userInfo?.avatar!)
                }
            })
            return res;
        })
    }, [data, config])


    const unresloveData = useCallback((data: any) => {
        return {
            [config.titleAccessor?.id]: data.title,
            [config.descAccessor?.id]: data.description,
            [config.startAccessor?.id]: (data.startDate as Date).toISOString(),
            [config.endAccessor?.id]: (data.endDate as Date).toISOString(),
        }
    }, [config])


    return <NodeViewWrapper className="w-full min-h-[700px] relative flex flex-col gap-1 text-popover-foreground">
        <CalendarProvider
            toggleSettings={toggle}
            editor={editor}
            events={resloveData()}
            users={[
                {
                    id: userInfo?.id!,
                    name: userInfo?.name!,
                    picturePath: usePath(userInfo?.avatar!)
                }
            ]}
            onEventAdd={(event) => {
                const data = unresloveData(event)
                handleAddRow(data)
            }}
        >
            <ClientContainer />
            {/* <ChangeWorkingHoursInput/> */}
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
                                }} key={index}>{column.title}</DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
                <div className="flex flex-row justify-between items-center rounded-sm border hover:bg-muted p-2">
                    描述
                    <DropdownMenu>
                        <DropdownMenuTrigger>{config?.descAccessor?.title || <Settings className="h-4 w-4" />}</DropdownMenuTrigger>
                        <DropdownMenuContent side="right" align="start">
                            {columns && columns.map((column: any, index: number) => (
                                <DropdownMenuItem onClick={() => {
                                    config.descAccessor = column
                                    updateAttributes({
                                        ...node.attrs,
                                        viewOptions: {
                                            ...node.attrs.viewOptions,
                                            [props.viewKey]: { ...config }
                                        }
                                    })
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