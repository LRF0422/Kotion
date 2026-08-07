import { Columns } from "./columns";
import { Column } from "./column";
import { ExtensionWrapper } from "@kn/common";
import { ColumnsBubbleMenu, ColumnsStaticMenu } from "./menu";
import { IconColumns } from "../../icons";
import { createT } from "../../i18n";
import React from "react";
export * from "./menu";
import "./style/index.css"

export const ColumnsExtensions = [Columns, Column];

const t = createT();

export const ColumnsExtension: ExtensionWrapper = {
	name: Column.name,
	extendsion: [Columns, Column],
	bubbleMenu: ColumnsBubbleMenu,
	menuConfig: {
		group: 'block',
		menu: ColumnsStaticMenu,
		tooltip: 'editor.tooltip.columns',
	},
	slashConfig: [
		{
			icon: <IconColumns />,
			text: t('slashCommands.columns'),
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
