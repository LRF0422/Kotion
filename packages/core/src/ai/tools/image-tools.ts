import type { Editor } from "@kn/editor"
import { z } from "@kn/ui"
import type { ToolsRecord } from "@kn/common"
import {
    AGENT_IMAGES_KEY,
    urlToAgentImage,
    type AgentImageData,
} from "@kn/common"

/** Node types that carry an image source. */
const IMAGE_NODE_TYPES = new Set(["image", "imageInline"])

interface LocatedImage {
    src: string
    alt?: string
    name?: string
}

/**
 * Resolve an image in the bound document by blockId, or by an explicit src.
 * The agent passes the blockId it saw in getDocumentStructure; resolving here
 * keeps the (possibly large) URL out of the model's arguments.
 */
function locateImage(editor: Editor, blockId?: string, src?: string): LocatedImage | null {
    if (src) {
        return { src }
    }
    if (!blockId) {
        return null
    }
    let found: LocatedImage | null = null
    editor.state.doc.descendants((node) => {
        if (found) return false
        if (!IMAGE_NODE_TYPES.has(node.type.name)) return true
        const attrs = node.attrs as Record<string, any>
        const id = attrs.id ?? attrs.blockId
        if (id !== blockId) return true
        if (typeof attrs.src !== "string" || !attrs.src) return false
        found = {
            src: attrs.src,
            alt: typeof attrs.alt === "string" ? attrs.alt : undefined,
            name: typeof attrs.title === "string" ? attrs.title : undefined,
        }
        return false
    })
    return found
}

/**
 * Create the image-reading tool.
 *
 * The tool does NOT interpret the image itself — it loads the bytes and hands
 * them to the backend, which attaches them to the conversation as multimodal
 * content so the model's own vision reads them. This is why the result is a
 * structured envelope ({@link AGENT_IMAGES_KEY}) rather than prose: the model
 * must not receive base64 as tool text.
 */
export const createImageTools = (editor: Editor): ToolsRecord => ({
    readImage: {
        description:
            '读取当前文档中的图片并将其交给多模态模型直接查看（识别图片内容、图表、截图文字等）。' +
            '先用 getDocumentStructure 找到图片块的 blockId，再调用本工具；' +
            '也可直接传入图片 src。仅支持图片块；图片会作为视觉输入附加到对话中。',
        inputSchema: z.object({
            blockId: z.string().optional().describe('图片块的 blockId（来自文档结构）'),
            src: z.string().optional().describe('图片地址（已知 src 时可直接传入）'),
            question: z.string().optional().describe('希望模型重点看的方面（可选）'),
        }),
        readOnly: true,
        execute: async ({ blockId, src, question }: {
            blockId?: string
            src?: string
            question?: string
        }) => {
            if (!blockId && !src) {
                return { error: '请提供 blockId 或 src 以定位图片' }
            }
            const located = locateImage(editor, blockId, src)
            if (!located) {
                return { error: blockId ? `未找到 blockId 为 ${blockId} 的图片块` : '未找到图片' }
            }
            const image: AgentImageData = await urlToAgentImage(
                located.src,
                located.alt ?? question,
                located.name,
            )
            if (!image.data) {
                return { error: '图片内容为空，无法读取' }
            }
            return {
                [AGENT_IMAGES_KEY]: [image],
                note: located.alt ? `已读取图片：${located.alt}` : '已读取图片',
            }
        },
    },
})
