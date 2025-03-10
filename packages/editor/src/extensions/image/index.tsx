import React from "react";
import { ExtensionWrapper } from "@repo/common";
import { Image } from "./image";
import { ImageBubbleMenu, ImageStaticMenu } from "./menu";
// import { uploadImage } from "../../utilities";
import { ImageIcon } from "@repo/icon";

export * from "./image";
export * from "./menu";

export const ImageExtension: ExtensionWrapper = {
	name: Image.name,
	extendsion: Image,
	bubbleMenu: ImageBubbleMenu,
	menuConfig: {
		group: 'block',
		menu: ImageStaticMenu
	},
	slashConfig: [
		{
			text: '图片',
			slash: '/image',
			icon: <ImageIcon className="h-4 w-4" />,
			action: (editor) => {
			}
		}
	]
}
