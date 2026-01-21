import { CheckCircle2, CircleAlert, Info, TriangleAlert, XCircle } from "@kn/icon";
import { ExtensionWrapper } from "@kn/common";
import { InfoPanel } from "./info-panel";
import { InfoPanelBubbleMenu } from "./menu/bubble";
import { InfoPanelStaticMenu } from "./menu/static";
import { Editor } from "@tiptap/core";
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
	],
	tools: [
		{
			name: 'changeInfoPanelType',
			description: 'Change the type of info panel (info, success, warning, error)',
			inputSchema: {
				type: 'object',
				properties: {
					type: {
						type: 'string',
						enum: ['info', 'success', 'file', 'error'],
						description: 'The type of info panel'
					},
				},
				required: ['type']
			},
			execute: (editor: Editor) => (params: { type: string }) => {
				return editor.chain().updateAttributes(InfoPanel.name, { type: params.type }).run();
			}
		},
		{
			name: 'insertInfoPanel',
			description: 'Insert a new info panel of specified type',
			inputSchema: {
				type: 'object',
				properties: {
					type: {
						type: 'string',
						enum: ['info', 'success', 'file', 'error'],
						description: 'The type of info panel to insert'
					},
				},
				required: ['type']
			},
			execute: (editor: Editor) => (params: { type: string }) => {
				return editor.chain().focus().insertInfoPanel({ type: params.type }).run();
			}
		},
		{
			name: 'copyInfoPanel',
			description: 'Copy the current info panel',
			inputSchema: {},
			execute: (editor: Editor) => (_params: {}) => {
				// Get the current info panel node and duplicate it
				const { selection, doc } = editor.state;
				const { $from } = selection;
				const parent = $from.parent;
				if (parent.type.name === 'infoPanel') {
					const pos = $from.start() - 1; // Position of the info panel node
					const node = doc.nodeAt(pos);
					if (node && node.type.name === 'infoPanel') {
						// Insert a copy of the current info panel after the current one
						return editor.chain().insertContentAt(pos + node.nodeSize, node.toJSON()).run();
					}
				}
				return false;
			}
		},
		{
			name: 'deleteInfoPanel',
			description: 'Delete the current info panel',
			inputSchema: {},
			execute: (editor: Editor) => (_params: {}) => {
				return editor.chain().deleteSelection().run();
			}
		}
	]
}