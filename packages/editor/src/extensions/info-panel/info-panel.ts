import { Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { InfoPanelView } from "./info-panel-view";
import { CheckCircle2, CircleAlert, MailWarning, TriangleAlert, XCircle } from "@repo/icon";


declare module "@tiptap/core" {
	interface Commands<ReturnType> {
		// @ts-ignore
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
	priority: 1000,

	addOptions() {
		return {
			type: {
				info: {
					color: '#E9F2FF',
					icon: CircleAlert,
					iconColor: '#1D7AFC'
				},
				success: {
					color: '#DCFFF1',
					icon: CheckCircle2,
					iconColor: '#22A06B'
				},
				file: {
					color: '#FFF7D6',
					icon: TriangleAlert,
					iconColor: '#E56910'
				},
				error: {
					color: '#FFECEB',
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