import { OrderedList, ListItem } from "@tiptap/extension-list";
import { ExtensionWrapper } from "@kn/common";
import { OrderListStaticMenu } from "./menu/static-menu";
import { ListOrdered } from "@kn/icon";
import { createT } from "../../i18n";
import React from "react";

export * from "./ordered-list";
export * from "./menu/static-menu"


const t = createT();

export const OrderListExtension: ExtensionWrapper = {
	name: OrderedList.name,
	extendsion: [OrderedList, ListItem],
	menuConfig: {
		group: 'mark',
		menu: OrderListStaticMenu,
		tooltip: 'editor.tooltip.orderedList',
	},
	slashConfig: [
		{
			icon: <ListOrdered className="h-4 w-4" />,
			text: t('slashCommands.orderedList'),
			slash: '/orderlist',
			action: (editor) => {
				editor.chain().toggleOrderedList().run()
			}
		}
	],
	flotMenuConfig: [OrderListStaticMenu]
}
