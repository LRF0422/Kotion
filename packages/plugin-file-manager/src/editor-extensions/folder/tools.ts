/**
 * File Manager Tools for AI Agent Interaction
 * 
 * These tools allow the AI agent to interact with the file management system,
 * enabling operations like browsing, creating, and managing files/folders.
 */

import { Editor } from '@kn/editor'
import { useApi } from '@kn/core'
import { z } from '@kn/ui'
import { APIS } from '../../api'

// Type definitions for file items
interface FileItemInfo {
    id: string
    name: string
    type: 'FOLDER' | 'FILE'
    path?: string
    size?: number
    createdAt?: string
    updatedAt?: string
}

// Helper function to resolve file data from API response
const resolveFileItem = (file: any): FileItemInfo => ({
    id: file.id,
    name: file.name,
    type: file.type?.value || file.type,
    path: file.path,
    size: file.size,
    createdAt: file.createdAt,
    updatedAt: file.updatedAt,
})












/**
 * Tool: Insert a network image into the document
 */
export const insertNetworkImageTool = {
    name: 'insertNetworkImage',
    description: '从网络URL插入图片到文档。需要提供有效的图片URL地址。',
    inputSchema: z.object({
        url: z.string().url().describe('网络图片的URL地址'),
        alt: z.string().optional().describe('图片的替代文本（无障碍描述）'),
        title: z.string().optional().describe('图片标题'),
        pos: z.number().optional().describe('插入位置，不填则在当前光标位置插入'),
    }),
    execute: (editor: Editor) => async (params: { url: string; alt?: string; title?: string; pos?: number }) => {
        const { url, alt = '', title = '', pos } = params

        try {
            // Validate URL format
            const urlPattern = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/;
            if (!urlPattern.test(url)) {
                return {
                    success: false,
                    error: '无效的URL格式'
                }
            }

            const imageNode = {
                type: 'image',
                attrs: {
                    src: url,
                    alt,
                    title,
                }
            }

            if (pos !== undefined) {
                const docSize = editor.state.doc.nodeSize
                if (pos < 0 || pos >= docSize) {
                    return {
                        success: false,
                        error: `位置 ${pos} 超出文档范围 (0-${docSize - 1})`
                    }
                }
                editor.chain().focus().insertContentAt(pos, imageNode).run()
            } else {
                editor.chain().focus().insertContent(imageNode).run()
            }

            return {
                success: true,
                url,
                message: '已插入网络图片'
            }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : '插入网络图片失败',
            }
        }
    }
}



/**
 * All file manager tools
 */
export const fileManagerTools = [
    insertNetworkImageTool,
]
