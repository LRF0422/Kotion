import { useMemo } from "react";
import { addMonths, startOfYear } from "date-fns";

import { useCalendar } from "../../contexts/calendar-context";

import { YearViewMonth } from "../../components/year-view/year-view-month";

import type { IEvent } from "../../interfaces";
import React from "react";
import { ScrollArea } from "@kn/ui";

interface IProps {
  allEvents: IEvent[];
}

export function CalendarYearView({ allEvents }: IProps) {
  const { selectedDate } = useCalendar();

  const months = useMemo(() => {
    const yearStart = startOfYear(selectedDate);
    return Array.from({ length: 12 }, (_, i) => addMonths(yearStart, i));
  }, [selectedDate]);

  return (
    <ScrollArea className="h-full overflow-auto">
      <div className="p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-3">
          {months.map(month => (
            <YearViewMonth key={month.toString()} month={month} events={allEvents} />
          ))}
        </div>
      </div>
    </ScrollArea>
  );
}
