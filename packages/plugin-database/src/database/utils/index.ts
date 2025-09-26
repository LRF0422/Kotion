import { Node, NodeType, Range, Schema, Slice } from "@kn/editor";
import { EditorState } from "@kn/editor";
import { Decoration, DecorationSet, DecorationSource, EditorView } from "@kn/editor";
import { findParentNode } from "@kn/editor";
import { uuidv4 } from "lib0/random";
import { Editor, JSONContent } from "@kn/editor";
import { cloneDeep } from "lodash";

export interface Column {
	title: string
	dataIndex: string
	dataType: string
}

const creatDefaultData = (dataType: string) => {
	switch (dataType) {
		case 'date-picker-cell':
			return new Date().toISOString()
		case 'id':
			return uuidv4()
		default:
			return ''
	}
}

export function createGridView(schema: Schema, columns: any[], length = 0) {
	const types = getGridViewNodeTypes(schema);
	console.log(types);

	let grid = null;
	const row = []

	for (let i = 0; i < length; i++) {
		const data: Node[] = []
		columns.forEach((it, index) => {
			const cell = (types.gridCell as NodeType).createAndFill({
				data: creatDefaultData(it.dataType)
			})
			if (cell) {
				data.push(cell)
			}
		})
		row.push(
			(types.gridRow as NodeType).createChecked({ id: data[0].attrs.data }, data)
		)
	}

	grid = (types.gird as NodeType).createChecked({ columns }, row)
	return grid;
}

export const getDatabaseData = (node: Node) => {
	if (node.type.name !== "database") {
		throw new Error("current node is not a database node")
	}
	const columns = node.attrs.columns
	console.log('loaded node', node);
	console.log('loaded columns', columns);
	const data: any[] = []
	node.forEach((row) => {
		const d: any = {}
		for (let j = 0; j < row.childCount; j++) {
			d[`${columns[j].id}`] = row.child(j).attrs.data
		}
		data.push(d)
	})
	console.log('loaded data', data);
	return data;
}

export function getGridViewNodeTypes(schema: Schema) {
	return {
		gird: schema.nodes['database'],
		gridRow: schema.nodes['gridRow'],
		gridCell: schema.nodes['gridCell']
	}
}

export function isInGrid(state: EditorState): boolean {
	const $head = state.selection.$head;
	for (let d = $head.depth; d > 0; d--)
		if ($head.node(d).type.name == 'gridRow') return true;
	return false;
}

export const addRow = (editor: Editor, state: EditorState, view: EditorView, node: Node, tableStart: number, data?: any) => {

	if (node) {
		let rowPos = tableStart
		node.forEach((row) => {
			rowPos += row.nodeSize
		})
		const colCount = node.attrs.columns.length
		const columns = node.attrs.columns
		const cols = []
		for (let i = 0; i < colCount; i++) {
			const id = columns[i].id
			const fieldValue = data && (data[id] || undefined)
			cols.push(
				(state.schema.nodes['gridCell'] as NodeType).createAndFill({ isHeader: false, dataType: node.attrs.columns[i].dataType, data: fieldValue || creatDefaultData(node.attrs.columns[i].dataType) })
			)
		}
		const row = (state.schema.nodes['gridRow'] as NodeType).createChecked({ id: cols[0]?.attrs.data }, cols as Node[])
		editor.chain().insertContentAt(rowPos + 1, row).run()
	}

}

export const addCol = (state: EditorState, view: EditorView, node: Node, pos: number, column: any) => {

	let insertPos = pos + 1 // grid pos
	const tr = state.tr
	const value = creatDefaultData(column.dataType)
	console.log('value', value);

	const json = node.toJSON() as JSONContent

	if (json) {
		json.content?.forEach(row => {
			row.content?.push({
				type: 'gridCell',
				attrs: {
					data: value,
					dataType: column.dataType
				}
			})
		})
		json.attrs!.columns.push(column)
		console.log('json', json)
		tr.replaceWith(pos, pos + node.nodeSize, Node.fromJSON(state.schema, json))
		view.dispatch(tr)
	}
	console.log("addCol");

}

export const deleteCol = (state: EditorState, view: EditorView, node: Node, pos: number, colIndex: number) => {
	console.log('node pos', pos)
	let begin = pos
	const tr = state.tr
	node.forEach((row) => {
		begin = begin + (row.nodeSize)
		let start = begin - row.nodeSize + 1
		let end = 0
		row.forEach((col, _, index) => {

			if (index === colIndex) {
				end = start + col.nodeSize
				tr.deleteRange(start, end)
			} else {
				start = start + col.nodeSize
			}
		})
	})
	view.dispatch(tr)
}

export const deleteColV2 = (state: EditorState, view: EditorView, node: Node, pos: number, colIndex: number) => {
	const json = node.toJSON() as JSONContent
	if (json.type !== 'database') {
		return
	}
	json.content?.forEach((row) => {
		row.content = row.content?.filter((_, index) => index !== colIndex)
	})
	const columns = (json.attrs?.columns as any[]).filter((_, index) => index !== colIndex)
	json.attrs!.columns = columns

	const newNode = Node.fromJSON(state.schema, json)
	const tr = state.tr
	tr.replaceWith(pos, pos + node.nodeSize, newNode)
	view.dispatch(tr)
	console.log('deleteColV2');

}

export const moveCol = (state: EditorState, view: EditorView, node: Node, pos: number, source: string, target: string, attrs: any) => {
	const json = node.toJSON() as JSONContent
	const columns = cloneDeep(json.attrs?.columns) as any[]
	let sourceIndex = 0;
	let targetIndex = 0;
	columns.forEach((it, index) => {
		if (it.id === source) {
			sourceIndex = index
		}
		if (it.id === target) {
			targetIndex = index
		}
	})


	json.content?.forEach((row) => {
		const sourceCol = row.content?.find((_, index) => index === sourceIndex)
		const targetCol = row.content?.find((_, index) => index === targetIndex)
		const contents = cloneDeep(row.content)
		if (sourceCol && targetCol) {
			contents?.forEach((col, index) => {
				if (index === sourceIndex) {
					row.content && (row.content[index] = targetCol)
				}
				if (index === targetIndex) {
					row.content && (row.content[index] = sourceCol)
				}
			})
		}
	})

	console.log('result', json);
	const tr = state.tr
	tr.replaceWith(pos, pos + node.nodeSize, Node.fromJSON(state.schema, json))
	tr.setNodeMarkup(pos, undefined, attrs)
	view.dispatch(tr)
	console.log('moveCol');

}


export function drawCellSelection(state: EditorState): DecorationSource | null {
	const cells: Decoration[] = [];
	const cell = findParentNode(node => node.type.name === 'gridCell')(state.selection);
	if (cell) {
		cells.push(
			Decoration.node(cell.pos, cell.pos + cell.node.nodeSize, {
				style: 'border: 1px soild green'
			})
		)
		return DecorationSet.create(state.doc, cells);
	}
	return null
}

export const removeRow = (editor: Editor, state: EditorState, view: EditorView, node: Node, pos: number, rowIndex: string[]) => {
	const json = node.toJSON() as JSONContent
	if (node) {
		json.content = json.content?.filter(it => it.content && !rowIndex.includes(it.content[0].attrs?.data))
		const tr = state.tr.replaceWith(pos, pos + node.nodeSize, Node.fromJSON(state.schema, json))
		view.dispatch(tr)
	}
}

export const getCellPos = (node: Node, pos: number, colIndex: number, rowIndex: number) => {
	let cellPos = pos
	for (let i = 0; i <= (rowIndex - 1); i++) {
		cellPos = cellPos + node?.child(i).nodeSize
	}
	const targetRow = node?.child(rowIndex);
	for (let i = 0; i <= colIndex; i++) {
		cellPos = cellPos + targetRow.child(i).nodeSize
	}
	cellPos = cellPos + 1
	return cellPos;
}

export interface UpdateCellProps {
	colIndex: number
	rowIndex: number
	data: any
}

export const updateCellData = (state: EditorState, view: EditorView, node: Node, pos: number, colIndex: number, rowIndex: number, data: any) => {
	const cellPos = getCellPos(node, pos, colIndex, rowIndex);
	const targetNode = view.state.doc.nodeAt(cellPos);
	if (targetNode) {
		const tr = state.tr.setNodeMarkup(cellPos, state.schema.nodes['gridCell'], { ...targetNode.attrs, data: data })
		view.dispatch(tr)
	}
}

export const updateCellDataV2 = (state: EditorState, view: EditorView, node: Node, pos: number, updateCells: UpdateCellProps[] = []) => {
	console.log('update cell, props', updateCells);

	if (updateCells.length > 0) {
		const tr = state.tr
		updateCells.forEach(it => {
			const cellPos = getCellPos(node, pos, it.colIndex, it.rowIndex);
			const targetNode = view.state.doc.nodeAt(cellPos);
			if (targetNode) {
				tr.setNodeMarkup(cellPos, state.schema.nodes['gridCell'], { ...targetNode.attrs, data: it.data })
			}
		})
		view.dispatch(tr)
	}
}


export const getHeaderConfig = (node: Node, colId: string) => {
	const header = node.child(0)
	let attrs = null
	header.forEach(n => {
		if (n.attrs.dataIndex === colId) {
			attrs = n.attrs
		}
	})
	return attrs;
}