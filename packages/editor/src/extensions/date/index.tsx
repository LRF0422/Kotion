import { ExtensionWrapper } from "@kn/common";
import { Date } from "./date";
import { Calendar as ECalendar } from "./calendar";
import React from "react";
import { Calendar } from "@kn/icon";

declare module "@tiptap/core" {
	interface Commands<ReturnType> {
		date: {
			insertDate: () => ReturnType;
			insertCalendar: () => ReturnType
		};
	}
}

export const DateExtension: ExtensionWrapper = {
	name: Date.name,
	extendsion: [Date, ECalendar],
	slashConfig: [
		{
			icon: <Calendar className="h-4 w-4" />,
			text: '日期',
			slash: '/date',
			action: (editor) => editor.commands.insertDate()
		},
		{
			icon: <Calendar className="h-4 w-4" />,
			text: '日历',
			slash: '/calendar',
			action: (editor) => {
				editor.commands.insertCalendar()
			}
		}
	]
}