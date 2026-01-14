import { Info } from "@kn/icon";
import { ExtensionWrapper } from "@kn/common";
import { InfoPanel } from "./info-panel";
import { InfoPanelBubbleMenu } from "./menu/bubble";
import { InfoPanelStaticMenu } from "./menu/static";
import React from "react";

// Export constants for external use
export { INFO_PANEL_TYPES, DEFAULT_INFO_PANEL_TYPE, DEFAULT_INFO_PANEL_TIPS } from "./constants";
export type { InfoPanelType, InfoPanelTypeConfig } from "./constants";

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