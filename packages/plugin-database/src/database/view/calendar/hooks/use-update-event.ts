import { useContext } from "react";
import { useCalendar } from "../contexts/calendar-context";

import type { IEvent } from "../interfaces";
import { NodeViewContext } from "../../../../database/Context";

export function useUpdateEvent() {
  const { } = useCalendar();
  const { handleDataChange } = useContext(NodeViewContext)

  // This is just and example, in a real scenario
  // you would call an API to update the event
  const updateEvent = (event: IEvent) => {
    const newEvent: IEvent = event;

    newEvent.startDate = new Date(event.startDate).toISOString();
    newEvent.endDate = new Date(event.endDate).toISOString();

    // setLocalEvents(prev => {
    //   const index = prev.findIndex(e => e.id === event.id);
    //   if (index === -1) return prev;
    //   return [...prev.slice(0, index), newEvent, ...prev.slice(index + 1)];
    // });
  };

  return { updateEvent };
}
