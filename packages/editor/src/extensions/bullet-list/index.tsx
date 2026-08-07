import React from "react";
import { BulletList } from "@tiptap/extension-list";
import { ExtensionWrapper } from "@kn/common";
import { BulletListStaticMenu } from "./menu/static-menu";
import { List } from "@kn/icon";
import { createT } from "../../i18n";

export * from "./bullet-list";
export * from "./menu/static-menu"

const t = createT();

export const BulletListExtension: ExtensionWrapper = {
	name: BulletList.name,
	extendsion: [BulletList],
	menuConfig: {
		group: 'mark',
		menu: BulletListStaticMenu,
		tooltip: 'editor.tooltip.bulletList',
	},
	slashConfig: [
		{
			icon: <List className="h-4 w-4" />,
			text: t('slashCommands.bulletList'),
			slash: '/unorderList',
			action: (editor) => {
				editor.chain().focus().toggleBulletList().run();
			}
		}
	]
}
