import { Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { InfoPanelView } from "./info-panel-view";
import { INFO_PANEL_TYPES, DEFAULT_INFO_PANEL_TYPE, DEFAULT_INFO_PANEL_TIPS } from "./constants";


declare module "@tiptap/core" {
	interface Commands<ReturnType> {
		infoPanel: {
			insertInfoPanel: (options: {
				type: string
			}) => ReturnType;
		};
	}
}

export const InfoPanel = Node.create({
	name: 'infoPanel',
	content: "block+",
	group: 'block',
	isolating: true,
	priority: 1000,
	addOptions() {
		return {
			type: INFO_PANEL_TYPES,
			exitOnTripleEnter: true,
			exitOnArrowDown: true
		}
	},

	renderHTML(HTMLAttributes) {
		return ['div', HTMLAttributes, 0]
	},

	addAttributes() {
		return {
			type: {
				default: DEFAULT_INFO_PANEL_TYPE,
				parseHTML: ele => ele.getAttribute("type")
			},
			color: {
				default: "#E9F2FF"
			},
			tips: {
				default: DEFAULT_INFO_PANEL_TIPS
			},
			customIconColor: {
				default: null,
				parseHTML: ele => ele.getAttribute("customIconColor")
			},
			customBgColorLight: {
				default: null,
				parseHTML: ele => ele.getAttribute("customBgColorLight")
			},
			customBgColorDark: {
				default: null,
				parseHTML: ele => ele.getAttribute("customBgColorDark")
			},
			customEmoji: {
				default: null,
				parseHTML: ele => ele.getAttribute("customEmoji")
			}
		}
	},
	addNodeView() {
		return ReactNodeViewRenderer(InfoPanelView)
	},
	addCommands() {
		return {
			insertInfoPanel: (options: { type: string }) => ({ chain }) => {
				return chain().focus().insertContent({
					type: this.name,
					attrs: {
						type: options.type
					},
					content: [
						{
							type: 'paragraph'
						}
					]
				}).run()
			}
		}
	}
})