/**
 * Document Plugin Tools for AI Agent Interaction
 *
 * These tools let the AI agent create, read and edit Univer document blocks.
 * They operate at the plain-text / paragraph level: edits rebuild the document
 * body from text, so inline formatting (textRuns) is not preserved across
 * append/replace operations. This is the baseline "usable" level — rich
 * formatting fidelity is a later iteration.
 */

import { Editor } from '@kn/editor'
import { z } from '@kn/ui'

// ─── Univer document body helpers ───────────────────────────
// Univer dataStream convention: '\r' ends a paragraph, '\n' ends a section.

const PARAGRAPH = '\r'
const SECTION = '\n'

/** Build a Univer IDocumentData from an array of plain-text paragraphs. */
export function buildDocumentData(paragraphs: string[]): Record<string, any> {
    const paras = paragraphs.length > 0 ? paragraphs : ['']
    const dataStream = paras.join(PARAGRAPH) + PARAGRAPH + SECTION

    const paragraphMarks: { startIndex: number }[] = []
    let idx = 0
    for (const p of paras) {
        idx += p.length // index of the '\r' that ends this paragraph
        paragraphMarks.push({ startIndex: idx })
        idx += 1 // skip the '\r'
    }
    const sectionBreaks = [{ startIndex: dataStream.length - 1 }] // the trailing '\n'

    return {
        id: `doc-${Date.now()}`,
        body: {
            dataStream,
            textRuns: [],
            paragraphs: paragraphMarks,
            sectionBreaks,
        },
        documentStyle: {},
    }
}

/** Extract plain-text paragraphs from a Univer document snapshot. */
function readParagraphs(documentData: Record<string, any> | null): string[] {
    const dataStream: string = documentData?.body?.dataStream ?? ''
    if (!dataStream) return []
    // Univer streams end with PARAGRAPH+SECTION ("\r\n"). Strip both, then split
    // on the remaining paragraph marks. Other control tokens are ignored (plain text).
    const trimmed = dataStream.replace(/\r?\n$/, '').replace(/\r$/, '')
    return trimmed.split(PARAGRAPH)
}

interface DocumentNodeInfo {
    pos: number
    documentData: Record<string, any> | null
    height: number
}

function findDocumentNodes(editor: Editor): DocumentNodeInfo[] {
    const nodes: DocumentNodeInfo[] = []
    editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'document') {
            nodes.push({ pos, documentData: node.attrs.documentData, height: node.attrs.height })
        }
    })
    return nodes
}

function setDocumentData(editor: Editor, pos: number, documentData: Record<string, any>) {
    editor.view.dispatch(
        editor.view.state.tr.setNodeMarkup(pos, undefined, {
            ...editor.state.doc.nodeAt(pos)!.attrs,
            documentData,
        }),
    )
}

// ─── Tools ──────────────────────────────────────────────────

export const insertDocumentTool = {
    name: 'insertDocument',
    description: '在文档中插入一个 Univer 文档块。可选地用纯文本内容预填充（按换行分段）。',
    inputSchema: z.object({
        text: z.string().optional().describe('初始文本内容，用换行符 \\n 分隔段落'),
        height: z.number().optional().describe('文档块高度（像素）'),
        pos: z.number().optional().describe('插入位置，不填则在光标处插入'),
    }),
    execute: (editor: Editor) => async (params: { text?: string; height?: number; pos?: number }) => {
        try {
            const documentData = params.text != null && params.text.length > 0
                ? buildDocumentData(params.text.split('\n'))
                : null

            const nodeContent: any = {
                type: 'document',
                attrs: { documentData, height: params.height ?? undefined },
            }

            if (params.pos !== undefined) {
                const docSize = editor.state.doc.nodeSize
                if (params.pos < 0 || params.pos >= docSize) {
                    return { success: false, error: `Position ${params.pos} out of range (0-${docSize - 1})` }
                }
                editor.chain().focus().insertContentAt(params.pos, nodeContent).run()
            } else {
                editor.chain().focus().insertContent(nodeContent).run()
            }

            return {
                success: true,
                hasContent: !!documentData,
                message: documentData ? '已插入带内容的文档块' : '已插入空白文档块',
            }
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : '插入文档失败' }
        }
    },
}

export const getDocumentInfoTool = {
    name: 'getDocumentInfo',
    description: '获取文档中所有 Univer 文档块的概览（序号、位置、段落数、字符数、前若干字预览）。',
    inputSchema: z.object({}),
    execute: (editor: Editor) => async () => {
        try {
            const nodes = findDocumentNodes(editor)
            const documents = nodes.map((n, index) => {
                const paragraphs = readParagraphs(n.documentData)
                const text = paragraphs.join('\n')
                return {
                    index,
                    pos: n.pos,
                    height: n.height,
                    paragraphCount: paragraphs.length,
                    charCount: text.length,
                    preview: text.slice(0, 80),
                }
            })
            return { success: true, count: documents.length, documents }
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : '获取文档信息失败' }
        }
    },
}

export const readDocumentTextTool = {
    name: 'readDocumentText',
    description: '读取文档中某个 Univer 文档块的纯文本内容（按段落返回）。',
    inputSchema: z.object({
        index: z.number().describe('文档块序号（从 0 开始，可通过 getDocumentInfo 获取）'),
    }),
    execute: (editor: Editor) => async (params: { index: number }) => {
        try {
            const node = findDocumentNodes(editor)[params.index]
            if (!node) return { success: false, error: `未找到序号 ${params.index} 的文档块` }
            const paragraphs = readParagraphs(node.documentData)
            return { success: true, paragraphs, text: paragraphs.join('\n'), paragraphCount: paragraphs.length }
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : '读取文档内容失败' }
        }
    },
}

export const appendDocumentTextTool = {
    name: 'appendDocumentText',
    description: '向文档块末尾追加文本段落（用换行符 \\n 分隔多段）。注意：会以纯文本重建，不保留原有内联格式。',
    inputSchema: z.object({
        index: z.number().describe('文档块序号（从 0 开始）'),
        text: z.string().describe('要追加的文本，\\n 分隔段落'),
    }),
    execute: (editor: Editor) => async (params: { index: number; text: string }) => {
        try {
            const node = findDocumentNodes(editor)[params.index]
            if (!node) return { success: false, error: `未找到序号 ${params.index} 的文档块` }
            const existing = readParagraphs(node.documentData)
            const added = params.text.split('\n')
            const merged = [...existing, ...added]
            setDocumentData(editor, node.pos, buildDocumentData(merged))
            return { success: true, paragraphsAdded: added.length, totalParagraphs: merged.length, message: `已追加 ${added.length} 段` }
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : '追加文档内容失败' }
        }
    },
}

export const replaceDocumentTextTool = {
    name: 'replaceDocumentText',
    description: '替换文档块中的文本。可整体替换全部内容，或对某个子串做查找替换。注意：以纯文本重建，不保留内联格式。',
    inputSchema: z.object({
        index: z.number().describe('文档块序号（从 0 开始）'),
        find: z.string().optional().describe('要查找的子串；不填则用 replace 覆盖全部内容'),
        replace: z.string().describe('替换为的文本（覆盖模式时即新全文，\\n 分隔段落）'),
    }),
    execute: (editor: Editor) => async (params: { index: number; find?: string; replace: string }) => {
        try {
            const node = findDocumentNodes(editor)[params.index]
            if (!node) return { success: false, error: `未找到序号 ${params.index} 的文档块` }

            let newParagraphs: string[]
            let replacements = 0
            if (params.find == null || params.find === '') {
                newParagraphs = params.replace.split('\n')
            } else {
                const current = readParagraphs(node.documentData).join('\n')
                const next = current.split(params.find)
                replacements = next.length - 1
                newParagraphs = next.join(params.replace).split('\n')
            }
            setDocumentData(editor, node.pos, buildDocumentData(newParagraphs))
            return {
                success: true,
                replacements: params.find ? replacements : undefined,
                message: params.find ? `替换了 ${replacements} 处` : '已覆盖全文',
            }
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : '替换文档内容失败' }
        }
    },
}

export const deleteDocumentTool = {
    name: 'deleteDocument',
    description: '删除文档中指定序号的 Univer 文档块。',
    inputSchema: z.object({
        index: z.number().describe('要删除的文档块序号（从 0 开始）'),
    }),
    execute: (editor: Editor) => async (params: { index: number }) => {
        try {
            const node = findDocumentNodes(editor)[params.index]
            if (!node) return { success: false, error: `未找到序号 ${params.index} 的文档块` }
            const docNode = editor.state.doc.nodeAt(node.pos)
            if (!docNode) return { success: false, error: '无法定位文档节点' }
            editor.view.dispatch(editor.view.state.tr.delete(node.pos, node.pos + docNode.nodeSize))
            return { success: true, message: `已删除第 ${params.index} 个文档块` }
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : '删除文档失败' }
        }
    },
}

export const documentTools = [
    insertDocumentTool,
    getDocumentInfoTool,
    readDocumentTextTool,
    appendDocumentTextTool,
    replaceDocumentTextTool,
    deleteDocumentTool,
]
