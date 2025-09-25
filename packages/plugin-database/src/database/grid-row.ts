import { PMNode as Node, mergeAttributes } from "@kn/editor";

export const GridRow = Node.create({
	name: 'gridRow',
	group: 'database',
	content: 'gridCell*',
	selectable: true,
	draggable: true,

	addAttributes() {
		return {
			isHeader: {
				default: false
			},
			id: {
				default: null
			}
		}
	},

	renderHTML({ HTMLAttributes }) {
		return ['div', mergeAttributes(HTMLAttributes, {
			class: 'node-grid-row'
		}), 0]
	},

	parseHTML() {
		return [
			{
				tag: 'div[class=node-grid-row]'
			}
		]
	}
})