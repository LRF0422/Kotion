import { Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { InfoPanelView } from "./info-panel-view";
import { CheckCircle2, CircleAlert, TriangleAlert, XCircle } from "@kn/icon";


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
			type: {
				info: {
					color: {
						light: '#cffafe',
						dark: '#083344'
					},
					icon: CircleAlert,
					iconColor: '#1D7AFC'
				},
				success: {
					color: {
						light: '#bbf7d0',
						dark: '#052e16',
					},
					icon: CheckCircle2,
					iconColor: '#22A06B'
				},
				file: {
					color: {
						light: '#fef3c7',
						dark: '#451a03'
					},
					icon: TriangleAlert,
					iconColor: '#E56910'
				},
				error: {
					color: {
						light: '#fecaca',
						dark: '#450a0a'
					},
					icon: XCircle,
					iconColor: '#C9372C'
				}
			},
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
				default: 'info',
				parseHTML: ele => ele.getAttribute("type")
			},
			color: {
				default: "#E9F2FF"
			},
			tips: {
				default: "Tips"
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