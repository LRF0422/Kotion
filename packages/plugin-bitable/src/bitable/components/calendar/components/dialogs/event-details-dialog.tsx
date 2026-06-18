"use client";

import { format, parseISO } from "date-fns";
import { Calendar, Clock, Text, User, Trash2 } from "@kn/icon";

import { Button } from "@kn/ui";
import { EditEventDialog } from "../../components/dialogs/edit-event-dialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@kn/ui";
import { useCalendar } from "../../contexts/calendar-context";

import type { IEvent } from "../../interfaces";
import React, { useState } from "react";

interface IProps {
  event: IEvent;
  children: React.ReactNode;
}

export function EventDetailsDialog({ event, children }: IProps) {
  const startDate = parseISO(event.startDate);
  const endDate = parseISO(event.endDate);
  const { onEventDelete } = useCalendar();
  const [open, setOpen] = useState(false);

  const handleDelete = () => {
    onEventDelete?.(event.id);
    setOpen(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>{children}</DialogTrigger>

        <DialogContent>
          <DialogHeader>
            <DialogTitle>{event.title}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-start gap-2">
              <User className="mt-1 size-4 shrink-0" />
              <div>
                <p className="text-sm font-medium">Responsible</p>
                <p className="text-sm text-muted-foreground">{event.user.name}</p>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <Calendar className="mt-1 size-4 shrink-0" />
              <div>
                <p className="text-sm font-medium">Start Date</p>
                <p className="text-sm text-muted-foreground">{format(startDate, "MMM d, yyyy h:mm a")}</p>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <Clock className="mt-1 size-4 shrink-0" />
              <div>
                <p className="text-sm font-medium">End Date</p>
                <p className="text-sm text-muted-foreground">{format(endDate, "MMM d, yyyy h:mm a")}</p>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <Text className="mt-1 size-4 shrink-0" />
              <div>
                <p className="text-sm font-medium">Description</p>
                <p className="text-sm text-muted-foreground">{event.description}</p>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            {onEventDelete && (
              <Button type="button" variant="ghost" className="mr-auto text-red-600 hover:text-red-700 dark:text-red-400" onClick={handleDelete}>
                <Trash2 className="size-4 mr-1.5" />
                Delete
              </Button>
            )}
            <EditEventDialog event={event}>
              <Button type="button" variant="outline">
                Edit
              </Button>
            </EditEventDialog>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
