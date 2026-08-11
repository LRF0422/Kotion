import type { Editor } from "@kn/editor"
import { z } from "@kn/ui"
import type { ToolsRecord } from "@kn/common"
import { findBlockPosById } from "@kn/common"

/** Max references per call — enough for a cited answer, small enough to stay scannable. */
const MAX_REFERENCES = 8

const textPreviewOf = (node: any, max = 60): string => {
    const text: string = node.textContent ?? ''
    return text.length > max ? text.slice(0, max) + '…' : text
}

/**
 * Create the document-reference tool.
 *
 * The tool itself does NOT scroll the editor or mutate the document — it only
 * validates the referenced blocks and echoes back display metadata. The chat
 * UI picks the result up from the tool-execution tape (ExecutionStep.result)
 * and renders clickable citation chips under the assistant message; clicking
 * a chip navigates the editor to that block.
 */
export const createReferenceTools = (editor: Editor): ToolsRecord => ({
    referenceBlocks: {
        description: '在回复中引用文档里的块。调用后聊天界面会把这些块渲染成可点击的引用卡片，用户点击即可跳转定位。当回答涉及文档中的具体位置（总结、审阅、指出问题、对照多处内容）时使用。blockId 从 getDocumentStructure 或 searchInDocument 获取。不会修改文档',
        inputSchema: z.object({
            references: z.array(z.object({
                blockId: z.string().describe("被引用块的 blockId"),
                note: z.string().optional().describe("一句话说明为什么引用该块（可选）")
            })).min(1).max(MAX_REFERENCES).describe("要引用的块列表，按引用顺序")
        }),
        execute: async ({ references }: {
            references: Array<{ blockId: string; note?: string }>
        }) => {
            const resolved = references.map(({ blockId, note }) => {
                const found = findBlockPosById(editor.state.doc, blockId)
                if (!found) {
                    return {
                        blockId,
                        found: false as const,
                        note,
                        error: '未找到该 blockId 对应的块（可能已被删除或移动）'
                    }
                }
                return {
                    blockId,
                    found: true as const,
                    note,
                    blockType: found.node.type.name,
                    textPreview: textPreviewOf(found.node)
                }
            })

            const foundCount = resolved.filter(r => r.found).length
            if (foundCount === 0) {
                return {
                    error: '所有引用的块都未找到，请先用 getDocumentStructure 获取有效的 blockId',
                    references: resolved
                }
            }

            return {
                success: true,
                references: resolved,
                found: foundCount,
                total: resolved.length,
                message: `已引用 ${foundCount} 个块，将以可点击卡片的形式展示在回复下方`
            }
        }
    }
})
