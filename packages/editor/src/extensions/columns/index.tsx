import { Columns } from "./columns";
import { Column } from "./column";
import { ExtensionWrapper } from "@repo/common";
import { ColumnsBubbleMenu, ColumnsStaticMenu } from "./menu";
import { IconColumns } from "../../icons";
import React from "react";
export * from "./menu";

export const ColumnsExtensions = [Columns, Column];

export const ColumnsExtension: ExtensionWrapper = {
	name: Column.name,
	extendsion: [Columns, Column],
	bubbleMenu: ColumnsBubbleMenu,
	menuConfig: {
		group: 'block',
		menu: ColumnsStaticMenu
	},
	slashConfig: [
		{
			icon: <IconColumns />,
			text: '布局',
			slash: '/columns',
			action: (editor) => {
				editor
					.chain()
					.focus()
					.insertColumns()
					.run()
			}
		}
	]
}
