import OrderedList from "@tiptap/extension-ordered-list";
import { ExtensionWrapper } from "@repo/common";
import { OrderListStaticMenu } from "./menu/static-menu";
import ListItem from "@tiptap/extension-list-item";
import { ListOrdered } from "@repo/icon";
import React from "react";

export * from "./ordered-list";
export * from "./menu/static-menu"


export const OrderListExtension: ExtensionWrapper = {
	name: OrderedList.name,
	extendsion: [OrderedList, ListItem],
	menuConfig: {
		group: 'mark',
		menu: OrderListStaticMenu
	},
	slashConfig: [
		{
			icon: <ListOrdered className="h-4 w-4" />,
			text: '有序列表',
			slash: '/orderlist',
			action: (editor) => {
				editor.chain().toggleOrderedList().run()
			}
		}
	],
	flotMenuConfig: [OrderListStaticMenu]
}
