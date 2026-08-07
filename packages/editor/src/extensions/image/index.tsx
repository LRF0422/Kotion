import React from "react";
import { ExtensionWrapper } from "@kn/common";
import { Image } from "./image";
import { ImageBubbleMenu, ImageStaticMenu } from "./menu";
import { ImageIcon } from "@kn/icon";
import { ImageInline } from "./image-inline";
import { createT } from "../../i18n";

export * from "./image";
export * from "./menu";

const t = createT();

export const ImageExtension: ExtensionWrapper = {
	name: Image.name,
	extendsion: [Image, ImageInline],
	bubbleMenu: ImageBubbleMenu,
	menuConfig: {
		group: 'block',
		menu: ImageStaticMenu,
		tooltip: 'editor.tooltip.image',
	},
	slashConfig: [
		{
			text: t('slashCommands.image'),
			slash: '/image',
			icon: <ImageIcon className="h-4 w-4" />,
			action: (editor) => {
			}
		}
	]
}
