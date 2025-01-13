import { Info } from "@repo/icon";
import { ExtensionWrapper } from "../../editor";
import { InfoPanel } from "./info-panel";
import { InfoPanelBubbleMenu } from "./menu/bubble";
import { InfoPanelStaticMenu } from "./menu/static";
import React from "react";


export const InfoPanelExtension: ExtensionWrapper = {
	name: InfoPanel.name,
	extendsion: InfoPanel,
	menuConfig: {
		group: 'block',
		menu: InfoPanelStaticMenu
	},
	bubbleMenu: InfoPanelBubbleMenu,
	slashConfig: [
		{
			icon: <Info className="h-4 w-4" />,
			text: '信息面板',
			slash: '/infoPanel',
			action: (editor) => {
				editor.chain().focus().insertInfoPanel({ type: 'info' }).run()
			}
		}
	]
}