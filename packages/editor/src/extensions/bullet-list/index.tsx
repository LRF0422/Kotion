import React from "react";
import {BulletList} from "@tiptap/extension-list";
import { ExtensionWrapper } from "@kn/common";
import { BulletListStaticMenu } from "./menu/static-menu";
import { List } from "@kn/icon";

export * from "./bullet-list";
export * from "./menu/static-menu"

export const BulletListExtension: ExtensionWrapper = {
	name: BulletList.name,
	extendsion: [BulletList],
	menuConfig: {
		group: 'mark',
		menu: BulletListStaticMenu
	},
	slashConfig: [
		{
			icon: <List className="h-4 w-4" />,
			text: '无序列表',
			slash: '/unorderList',
			action: (editor) => {
				editor.chain().focus().toggleBulletList().run();
			}
		}
	]
}
