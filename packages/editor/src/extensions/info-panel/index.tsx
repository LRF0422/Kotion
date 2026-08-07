import { ExtensionWrapper } from "@kn/common";
import { InfoPanel } from "./info-panel";
import { InfoPanelBubbleMenu } from "./menu/bubble";
import { InfoPanelStaticMenu } from "./menu/static";
import React from "react";
import { MessageSquare } from "@kn/icon";
import { createT } from "../../i18n";

// Export constants for external use
export { INFO_PANEL_TYPES, DEFAULT_INFO_PANEL_TYPE, PRESET_COLORS } from "./constants";
export type { InfoPanelType, InfoPanelTypeConfig, PresetColor } from "./constants";

const t = createT();

export const InfoPanelExtension: ExtensionWrapper = {
	name: InfoPanel.name,
	extendsion: InfoPanel,
	menuConfig: {
		group: 'block',
		menu: InfoPanelStaticMenu,
		tooltip: 'editor.tooltip.callout',
	},
	bubbleMenu: InfoPanelBubbleMenu,
	slashConfig: [
		{
			icon: <MessageSquare className="h-4 w-4" />,
			text: t('slashCommands.callout'),
			slash: '/callout',
			action: (editor) => {
				editor.chain().focus().insertInfoPanel({ type: 'default' }).run()
			}
		}
	],
}