import { Calendar } from "@repo/ui";
import { ExtensionWrapper } from "../../editor";
import { Date } from "./date";
import React from "react";

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
	extendsion: Date,
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