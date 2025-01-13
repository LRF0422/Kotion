import { Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { DateView } from "./date-view";


export const Date = Node.create({
	name: 'date',
	group: 'inline',
	inline: true,

	addAttributes() {
		return {
			class: {
				default: 'node-date',
				renderHTML() {
					return {
						class: 'node-date'
					}
				},
			},
			date: {
				default: null
			}
		}
	},

	addNodeView() {
		return ReactNodeViewRenderer(DateView)
	},

	addCommands() {
		return {
			insertDate: () => ({ commands }) => {
				return commands.insertContent({
					type: this.name
				})
			}
		}
	},

	renderHTML({ HTMLAttributes }) {
		return ['span', HTMLAttributes, 0]
	},
	parseHTML() {
		return [
			{
				tag: 'span[class=node-date]'
			}
		]
	},
})