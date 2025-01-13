import React, { useState } from "react";
import moment from 'moment';
import { cn } from "@repo/ui";
import { Button } from "@repo/ui";
import { ChevronLeftIcon, ChevronRightIcon } from "@repo/icon";
import localMoment from './moment-local'

moment.locale('zh-cn', localMoment as any)

export const Journals: React.FC = () => {

    const [currentMonth, setCurrentMonth] = useState(moment());
    const [selectedDate, setSelectedDate] = useState(moment());
    const [curren, setCurrent] = useState(moment())

    const startDay = currentMonth.clone().startOf('week');
    const endDay = currentMonth.clone().endOf('week');

    const days = []

    while (startDay.isBefore(endDay, 'day')) {
        const d = startDay.clone()
        const key = d.format('L')
        days.push(
            <div key={key}
                onClick={() => {
                    setSelectedDate(moment(key))
                }}
                className={cn("flex flex-col p-0.5 items-center rounded-sm text-sm hover:bg-muted w-[90px] cursor-pointer",
                    {
                        "bg-muted": selectedDate.format('L') === key,
                        "text-blue-500": curren.format('L') === key
                    }
                )}>
                <div>
                    {d.format('dddd')}
                </div>
                <div>
                    {d.format('D')}
                </div>
            </div>
        );
        startDay.add(1, 'day');
    }


    return <div className=" text-popover-foreground">
        <header className="p-1 flex gap-2 items-center justify-center border border-b border-l-0">
            <Button size="sm" onClick={() => {
                setCurrentMonth((c) => c.clone().add(-1, 'week'))
            }}>
                <ChevronLeftIcon className="h-4 w-4" />
            </Button>
            <div className="flex justify-center gap-3 ">
                {days}
            </div>
            <Button size="sm" onClick={() => {
                setCurrentMonth((c) => c.clone().add(1, 'week'))
            }}>
                <ChevronRightIcon className="h-4 w-4" />
            </Button>
            <Button size="sm" onClick={() => {
                setCurrentMonth(moment())
            }}>Today</Button>
        </header>
        <main className=" flex justify-center w-full pt-4">
            <div className="prose">
                <h1>{selectedDate.format('LL')}</h1>
            </div>
        </main>
    </div>
}