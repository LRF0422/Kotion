import type { TEventColor } from "./types";

export interface IUser {
  id: string;
  name: string;
  picturePath: string | null;
}

export interface IEvent {
  id: number;
  startDate: string;
  endDate: string;
  title: string;
  color: TEventColor;
  description: string;
  user: IUser;
  recordId?: string; // Bitable record ID for mapping
}

export interface ICalendarCell {
  day: number;
  currentMonth: boolean;
  date: Date;
}
