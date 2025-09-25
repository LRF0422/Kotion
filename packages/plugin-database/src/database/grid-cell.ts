import { PMNode as Node, mergeAttributes } from "@kn/editor";


export const GridCell = Node.create({
	name: 'gridCell',
	group: 'gridRow',

	addOptions() {
		return {
			rowHeight: 100
		}
	},

	addAttributes() {
		return {
			isHeader: {
				default: false
			},
			rowHeight: {
				default: 100
			},
			dataType: {
				default: 'Text'
			},
			show: {
				default: true
			},
			data: {
				default: null
			},
			title: {
				default: null
			},
			dataIndex: {
				default: null
			}
		}
	},
	renderHTML({ HTMLAttributes }) {
		return [
			'div',
			mergeAttributes(HTMLAttributes, { class: 'node-grid-cell', style: 'min-height: 50px; min-width: 50px; border: 1px solid #eee' }, {
				contenteditable: HTMLAttributes.isHeader ? false : true
			}),
			0
		]
	},
	parseHTML() {
		return [
			{
				tag: 'div[class=node-grid-cell]'
			}
		]
	}
})