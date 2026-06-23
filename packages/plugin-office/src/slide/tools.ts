/**
 * Slide Plugin Tools for AI Agent Interaction
 *
 * These tools manage Univer presentation blocks at the *page* level: insert,
 * inspect, duplicate and delete whole slide pages. They are deliberately
 * structure-agnostic — they move and clone entire page objects rather than
 * authoring page-element internals — so they stay valid regardless of the
 * exact Univer slide element schema.
 *
 * NOTE: Authoring brand-new pages with rich text content from scratch is NOT
 * provided here; it requires the verified Univer slide element model and is a
 * later iteration. Use duplicateSlidePage to grow a deck from an existing page.
 */

import { Editor } from '@kn/editor'
import { z } from '@kn/ui'

interface SlideNodeInfo {
    pos: number
    slideData: Record<string, any> | null
    height: number
}

function findSlideNodes(editor: Editor): SlideNodeInfo[] {
    const nodes: SlideNodeInfo[] = []
    editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'slide') {
            nodes.push({ pos, slideData: node.attrs.slideData, height: node.attrs.height })
        }
    })
    return nodes
}

/**
 * Locate the pages map and page order inside a slide snapshot, tolerating both
 * `slideData.body.pages` and top-level `slideData.pages` layouts.
 */
function getPages(slideData: Record<string, any> | null): {
    container: Record<string, any> | null
    pages: Record<string, any>
    pageOrder: string[]
} {
    if (!slideData) return { container: null, pages: {}, pageOrder: [] }
    const container = slideData.body && typeof slideData.body === 'object' ? slideData.body : slideData
    const pages: Record<string, any> = container.pages ?? {}
    const pageOrder: string[] = Array.isArray(container.pageOrder) ? container.pageOrder : Object.keys(pages)
    return { container, pages, pageOrder }
}

function setSlideData(editor: Editor, pos: number, slideData: Record<string, any>) {
    editor.view.dispatch(
        editor.view.state.tr.setNodeMarkup(pos, undefined, {
            ...editor.state.doc.nodeAt(pos)!.attrs,
            slideData,
        }),
    )
}

function newId(prefix: string): string {
    return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`
}

/** Deep-clone a page, assigning fresh ids to the page and all its elements. */
function clonePage(page: Record<string, any>): { id: string; page: Record<string, any> } {
    const clone = JSON.parse(JSON.stringify(page))
    const id = newId('page')
    clone.id = id
    // Regenerate element ids to avoid collisions across pages.
    if (clone.pageElements && typeof clone.pageElements === 'object') {
        const reKeyed: Record<string, any> = {}
        for (const el of Object.values(clone.pageElements) as any[]) {
            const elId = newId('el')
            if (el && typeof el === 'object') el.id = elId
            reKeyed[elId] = el
        }
        clone.pageElements = reKeyed
    }
    return { id, page: clone }
}

// ─── Tools ──────────────────────────────────────────────────

export const insertSlideTool = {
    name: 'insertSlide',
    description: '在文档中插入一个空的 Univer 演示文稿（幻灯片）块。',
    inputSchema: z.object({
        height: z.number().optional().describe('幻灯片块高度（像素）'),
        pos: z.number().optional().describe('插入位置，不填则在光标处插入'),
    }),
    execute: (editor: Editor) => async (params: { height?: number; pos?: number }) => {
        try {
            const nodeContent: any = { type: 'slide', attrs: { slideData: null, height: params.height ?? undefined } }
            if (params.pos !== undefined) {
                const docSize = editor.state.doc.nodeSize
                if (params.pos < 0 || params.pos >= docSize) {
                    return { success: false, error: `Position ${params.pos} out of range (0-${docSize - 1})` }
                }
                editor.chain().focus().insertContentAt(params.pos, nodeContent).run()
            } else {
                editor.chain().focus().insertContent(nodeContent).run()
            }
            return { success: true, message: '已插入演示文稿块' }
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : '插入演示文稿失败' }
        }
    },
}

export const getSlideInfoTool = {
    name: 'getSlideInfo',
    description: '获取文档中所有演示文稿块的概览（序号、位置、页数、每页标题）。',
    inputSchema: z.object({}),
    execute: (editor: Editor) => async () => {
        try {
            const nodes = findSlideNodes(editor)
            const slides = nodes.map((n, index) => {
                const { pages, pageOrder } = getPages(n.slideData)
                const pageList = pageOrder.map((pid, i) => ({
                    pageIndex: i,
                    id: pid,
                    title: pages[pid]?.title ?? '',
                }))
                return { index, pos: n.pos, height: n.height, pageCount: pageList.length, pages: pageList }
            })
            return { success: true, count: slides.length, slides }
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : '获取演示文稿信息失败' }
        }
    },
}

export const duplicateSlidePageTool = {
    name: 'duplicateSlidePage',
    description: '复制演示文稿中的某一页（在其后插入一份副本）。用于在已有页面基础上扩充演示文稿。',
    inputSchema: z.object({
        index: z.number().describe('演示文稿块序号（从 0 开始，可通过 getSlideInfo 获取）'),
        pageIndex: z.number().optional().describe('要复制的页序号（从 0 开始），默认最后一页'),
    }),
    execute: (editor: Editor) => async (params: { index: number; pageIndex?: number }) => {
        try {
            const node = findSlideNodes(editor)[params.index]
            if (!node) return { success: false, error: `未找到序号 ${params.index} 的演示文稿` }

            const slideData: Record<string, any> = node.slideData
                ? JSON.parse(JSON.stringify(node.slideData))
                : null
            const { container, pages, pageOrder } = getPages(slideData)
            if (!container || pageOrder.length === 0) {
                return { success: false, error: '该演示文稿暂无可复制的页面（空白演示文稿请先在编辑器中添加一页）' }
            }

            const srcIndex = params.pageIndex ?? pageOrder.length - 1
            const srcId = pageOrder[srcIndex]
            const srcPage = pages[srcId]
            if (!srcPage) return { success: false, error: `未找到第 ${srcIndex} 页` }

            const { id, page } = clonePage(srcPage)
            container.pages = { ...pages, [id]: page }
            const nextOrder = [...pageOrder]
            nextOrder.splice(srcIndex + 1, 0, id)
            container.pageOrder = nextOrder

            setSlideData(editor, node.pos, slideData)
            return { success: true, newPageId: id, pageCount: nextOrder.length, message: `已复制第 ${srcIndex} 页` }
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : '复制页面失败' }
        }
    },
}

export const deleteSlidePageTool = {
    name: 'deleteSlidePage',
    description: '删除演示文稿中的某一页。',
    inputSchema: z.object({
        index: z.number().describe('演示文稿块序号（从 0 开始）'),
        pageIndex: z.number().describe('要删除的页序号（从 0 开始）'),
    }),
    execute: (editor: Editor) => async (params: { index: number; pageIndex: number }) => {
        try {
            const node = findSlideNodes(editor)[params.index]
            if (!node) return { success: false, error: `未找到序号 ${params.index} 的演示文稿` }
            const slideData: Record<string, any> = node.slideData ? JSON.parse(JSON.stringify(node.slideData)) : null
            const { container, pages, pageOrder } = getPages(slideData)
            if (!container || pageOrder.length === 0) return { success: false, error: '该演示文稿没有页面' }

            const pid = pageOrder[params.pageIndex]
            if (!pid) return { success: false, error: `未找到第 ${params.pageIndex} 页` }

            const nextPages = { ...pages }
            delete nextPages[pid]
            container.pages = nextPages
            container.pageOrder = pageOrder.filter((_, i) => i !== params.pageIndex)

            setSlideData(editor, node.pos, slideData)
            return { success: true, pageCount: container.pageOrder.length, message: `已删除第 ${params.pageIndex} 页` }
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : '删除页面失败' }
        }
    },
}

export const deleteSlideTool = {
    name: 'deleteSlide',
    description: '删除文档中指定序号的演示文稿块。',
    inputSchema: z.object({
        index: z.number().describe('要删除的演示文稿块序号（从 0 开始）'),
    }),
    execute: (editor: Editor) => async (params: { index: number }) => {
        try {
            const node = findSlideNodes(editor)[params.index]
            if (!node) return { success: false, error: `未找到序号 ${params.index} 的演示文稿` }
            const docNode = editor.state.doc.nodeAt(node.pos)
            if (!docNode) return { success: false, error: '无法定位演示文稿节点' }
            editor.view.dispatch(editor.view.state.tr.delete(node.pos, node.pos + docNode.nodeSize))
            return { success: true, message: `已删除第 ${params.index} 个演示文稿` }
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : '删除演示文稿失败' }
        }
    },
}

export const slideTools = [
    insertSlideTool,
    getSlideInfoTool,
    duplicateSlidePageTool,
    deleteSlidePageTool,
    deleteSlideTool,
]
