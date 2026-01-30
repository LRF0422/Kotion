import { CheckCircle2, CircleAlert, Info, TriangleAlert, XCircle } from "@kn/icon";
import { ExtensionWrapper } from "@kn/common";
import { InfoPanel } from "./info-panel";
import { InfoPanelBubbleMenu } from "./menu/bubble";
import { InfoPanelStaticMenu } from "./menu/static";
import { Editor } from "@tiptap/core";
import React from "react";
import { Square } from "@kn/icon";

// Export constants for external use
export { INFO_PANEL_TYPES, DEFAULT_INFO_PANEL_TYPE, DEFAULT_INFO_PANEL_TIPS, PRESET_COLORS } from "./constants";
export type { InfoPanelType, InfoPanelTypeConfig, PresetColor } from "./constants";

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
			icon: <Square className="h-4 w-4" />,
			text: 'Callout',
			slash: '/callout',
			action: (editor) => {
				editor.chain().focus().insertInfoPanel({ type: 'default' }).run()
			}
		}
	],
	tools: [
		{
			name: 'changeInfoPanelType',
			description: 'Change the type of callout (default, info, success, warning, error, tip, bookmark)',
			inputSchema: {
				type: 'object',
				properties: {
					type: {
						type: 'string',
						enum: ['default', 'info', 'success', 'warning', 'error', 'tip', 'bookmark'],
						description: 'The type of callout'
					},
				},
				required: ['type']
			},
			execute: (editor: Editor) => (params: { type: string }) => {
				return editor.chain().updateAttributes(InfoPanel.name, { type: params.type }).run();
			}
		},
		{
			name: 'insertCallout',
			description: 'Insert a new callout of specified type',
			inputSchema: {
				type: 'object',
				properties: {
					type: {
						type: 'string',
						enum: ['default', 'info', 'success', 'warning', 'error', 'tip', 'bookmark'],
						description: 'The type of callout to insert'
					},
				},
				required: ['type']
			},
			execute: (editor: Editor) => (params: { type: string }) => {
				return editor.chain().focus().insertInfoPanel({ type: params.type }).run();
			}
		},
		{
			name: 'copyCallout',
			description: 'Copy the current callout',
			inputSchema: {},
			execute: (editor: Editor) => (_params: {}) => {
				const { selection, doc } = editor.state;
				const { $from } = selection;
				const parent = $from.parent;
				if (parent.type.name === 'infoPanel') {
					const pos = $from.start() - 1;
					const node = doc.nodeAt(pos);
					if (node && node.type.name === 'infoPanel') {
						return editor.chain().insertContentAt(pos + node.nodeSize, node.toJSON()).run();
					}
				}
				return false;
			}
		},
		{
			name: 'deleteCallout',
			description: 'Delete the current callout',
			inputSchema: {},
			execute: (editor: Editor) => (_params: {}) => {
				return editor.chain().deleteSelection().run();
			}
		}
	]
}