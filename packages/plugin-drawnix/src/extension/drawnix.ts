import { PMNode as Node, ReactNodeViewRenderer, mergeAttributes } from "@kn/editor"
import { DrawnixView } from "./DrawnixView"
import type { PlaitElement } from '@plait/core'

// Type for drawnix data structure
export interface DrawnixData {
    children: PlaitElement[]
    viewport?: { zoom: number; offsetX: number; offsetY: number }
}

// Type for mindmap node
export interface MindmapNodeData {
    id: string
    text: string
    children?: MindmapNodeData[]
}

declare module "@kn/editor" {
    interface Commands<ReturnType> {
        drawnix: {
            insertDrawnix: () => ReturnType
            insertDrawnixWithData: (data: DrawnixData) => ReturnType
            updateDrawnixAtPos: (pos: number, data: DrawnixData) => ReturnType
        }
    }
}

/**
 * Helper: Convert simple mindmap structure to PlaitElement format
 */
export function convertToPlaitElement(node: MindmapNodeData, isRoot: boolean = false): PlaitElement {
    const element: any = {
        id: node.id,
        data: {
            topic: {
                children: [{ text: node.text }]
            }
        },
        children: (node.children || []).map(child => convertToPlaitElement(child, false)),
        width: isRoot ? 72 : (node.text.length > 4 ? node.text.length * 12 : 42),
        height: isRoot ? 25 : 20
    }

    if (isRoot) {
        element.type = 'mindmap'
        element.isRoot = true
        element.rightNodeCount = element.children.length
        element.points = [[248, 470]]
    }

    return element
}

/**
 * Helper: Convert PlaitElement back to simple structure for reading
 */
export function extractMindmapStructure(element: PlaitElement): MindmapNodeData {
    const any = element as any
    const text = any.data?.topic?.children?.[0]?.text || ''
    return {
        id: any.id || '',
        text,
        children: (any.children || []).map((child: PlaitElement) => extractMindmapStructure(child))
    }
}

/**
 * Helper: Find a node by id in the tree
 */
export function findNodeById(elements: PlaitElement[], id: string): PlaitElement | null {
    for (const element of elements) {
        const any = element as any
        if (any.id === id) return element
        if (any.children && any.children.length > 0) {
            const found = findNodeById(any.children, id)
            if (found) return found
        }
    }
    return null
}

/**
 * Helper: Add a child node to a parent
 */
export function addChildToNode(
    elements: PlaitElement[],
    parentId: string,
    newNode: MindmapNodeData
): PlaitElement[] | null {
    const cloned = JSON.parse(JSON.stringify(elements))

    const addToParent = (nodes: any[], targetId: string): boolean => {
        for (const node of nodes) {
            if (node.id === targetId) {
                if (!node.children) node.children = []
                node.children.push(convertToPlaitElement(newNode, false))
                // Update rightNodeCount for root
                if (node.isRoot) {
                    node.rightNodeCount = node.children.length
                }
                return true
            }
            if (node.children && node.children.length > 0) {
                if (addToParent(node.children, targetId)) return true
            }
        }
        return false
    }

    if (addToParent(cloned, parentId)) {
        return cloned
    }
    return null
}

/**
 * Helper: Delete a node by id
 */
export function deleteNodeById(
    elements: PlaitElement[],
    nodeId: string
): PlaitElement[] | null {
    const cloned = JSON.parse(JSON.stringify(elements))

    const deleteFromParent = (nodes: any[], targetId: string): boolean => {
        for (let i = 0; i < nodes.length; i++) {
            if (nodes[i].id === targetId) {
                // Don't allow deleting root
                if (nodes[i].isRoot) return false
                nodes.splice(i, 1)
                return true
            }
            if (nodes[i].children && nodes[i].children.length > 0) {
                if (deleteFromParent(nodes[i].children, targetId)) {
                    // Update rightNodeCount for root after deletion
                    if (nodes[i].isRoot) {
                        nodes[i].rightNodeCount = nodes[i].children.length
                    }
                    return true
                }
            }
        }
        return false
    }

    if (deleteFromParent(cloned, nodeId)) {
        return cloned
    }
    return null
}

/**
 * Helper: Update a node's text by id
 */
export function updateNodeText(
    elements: PlaitElement[],
    nodeId: string,
    newText: string
): PlaitElement[] | null {
    const cloned = JSON.parse(JSON.stringify(elements))

    const updateInTree = (nodes: any[], targetId: string): boolean => {
        for (const node of nodes) {
            if (node.id === targetId) {
                if (node.data?.topic?.children?.[0]) {
                    node.data.topic.children[0].text = newText
                }
                return true
            }
            if (node.children && node.children.length > 0) {
                if (updateInTree(node.children, targetId)) return true
            }
        }
        return false
    }

    if (updateInTree(cloned, nodeId)) {
        return cloned
    }
    return null
}

export const Drawnix = Node.create({
    name: "drawnix",
    group: "block",
    atom: true,
    defining: true,
    addAttributes() {
        return {
            data: {
                default: null
            }
        }
    },

    renderHTML({ HTMLAttributes }) {
        return ["div", mergeAttributes(HTMLAttributes, { class: "node-drawnix" })]
    },
    addNodeView() {
        return ReactNodeViewRenderer(DrawnixView, {
            stopEvent: () => true
        })
    },
    addCommands() {
        return {
            insertDrawnix: () => ({ commands }) => {
                return commands.insertContent({
                    type: this.name,
                    attrs: {
                        mode: 'whiteboard'
                    }
                })
            },

            insertDrawnixWithData: (data: DrawnixData) => ({ commands }) => {
                return commands.insertContent({
                    type: this.name,
                    attrs: { data }
                })
            },

            updateDrawnixAtPos: (pos: number, data: DrawnixData) => ({ tr, dispatch }) => {
                if (!dispatch) return false

                const node = tr.doc.nodeAt(pos)
                if (!node || node.type.name !== 'drawnix') {
                    return false
                }

                tr.setNodeMarkup(pos, undefined, { data })
                dispatch(tr)
                return true
            }
        }
    }
})