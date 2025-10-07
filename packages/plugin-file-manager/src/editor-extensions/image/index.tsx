import React from "react";
import { ExtensionWrapper } from "@kn/common";
import { Image } from "./image";
import { ImageBubbleMenu, ImageStaticMenu } from "./menu";
import { ImageIcon } from "@kn/icon";
import { ImageGallery } from "./image-gallery/image-gallery";
import { showFolderDlg } from "../utils/showFolderDlg";

export * from "./image";
export * from "./menu";

export const ImageExtension: ExtensionWrapper = {
	name: Image.name,
	extendsion: [Image, ImageGallery],
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
				showFolderDlg(editor)
			}
		}
	]
}
