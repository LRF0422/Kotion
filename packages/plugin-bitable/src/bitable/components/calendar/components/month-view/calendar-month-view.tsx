import { useMemo, useRef, useState } from "react";

import { useCalendar } from "../../contexts/calendar-context";

import { DayCell } from "../../components/month-view/day-cell";
import { AddEventDialog } from "../../components/dialogs/add-event-dialog";

import { getCalendarCells, calculateMonthEventPositions } from "../../helpers";

import type { IEvent } from "../../interfaces";
import React from "react";

interface IProps {
  singleDayEvents: IEvent[];
  multiDayEvents: IEvent[];
}

const WEEK_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function CalendarMonthView({ singleDayEvents, multiDayEvents }: IProps) {
  const { selectedDate, editor } = useCalendar();

  // 点击空白日期格创建事件：复用 day/week 视图的 ref'd AddEventDialog 模式
  const addDialogRef = useRef<{ open: () => void; close: () => void }>(null);
  const [currentSelectDate, setCurrentSelectDate] = useState<Date | undefined>();
  const handleCreate = (date: Date) => {
    if (!editor.isEditable) return;
    setCurrentSelectDate(date);
    addDialogRef.current?.open();
  };

  const allEvents = [...multiDayEvents, ...singleDayEvents];

  const cells = useMemo(() => getCalendarCells(selectedDate), [selectedDate]);

  const eventPositions = useMemo(
    () => calculateMonthEventPositions(multiDayEvents, singleDayEvents, selectedDate),
    [multiDayEvents, singleDayEvents, selectedDate]
  );

  return (
    <div>
      <div className="grid grid-cols-7 divide-x">
        {WEEK_DAYS.map(day => (
          <div key={day} className="flex items-center justify-center py-2">
            <span className="text-xs font-medium text-muted-foreground">{day}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 overflow-hidden">
        {cells.map(cell => (
          <DayCell key={cell.date.toISOString()} cell={cell} events={allEvents} eventPositions={eventPositions} onCreate={handleCreate} />
        ))}
      </div>

      {/* 单例新建对话框，由格子点击触发并预填日期 */}
      <AddEventDialog startDate={currentSelectDate} ref={addDialogRef}><></></AddEventDialog>
    </div>
  );
}
