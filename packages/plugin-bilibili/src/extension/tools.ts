/**
 * Bilibili Plugin Tools for AI Agent Interaction
 * 
 * These tools allow the AI agent to interact with the Bilibili video embedding system,
 * enabling operations like inserting, updating, and managing Bilibili video embeds.
 */

import { Editor } from '@kn/editor';
import { z } from '@kn/ui';

// Helper function to validate BV ID format
const isValidBvid = (bvid: string): boolean => {
    return /^BV[a-zA-Z0-9]{10}$/.test(bvid);
};

// Helper function to extract BV ID from various Bilibili URL formats
const extractBvid = (url: string): string | null => {
    // Match various Bilibili URL formats
    const patterns = [
        /BV[a-zA-Z0-9]{10}/,
        /av(\d+)/,
        /video\/([a-zA-Z0-9]+)/,
    ];

    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) {
            let result = match[0];
            // If it's an av number, return as is (in a real implementation, av and BV mapping is more complex)
            if (/^\d+$/.test(result)) {
                return result;
            }
            return result.startsWith('BV') ? result : `BV${result}`;
        }
    }
    return null;
};

/**
 * Tool: Insert a Bilibili video into the document
 */
export const insertBilibiliVideoTool = {
    name: 'insertBilibiliVideo',
    description: '在文档中插入Bilibili视频。可以提供BV号或Bilibili视频链接。',
    inputSchema: z.object({
        source: z.string().describe('Bilibili视频的BV号或完整URL'),
        startTime: z.number().optional().describe('视频开始播放的时间点（秒）'),
        pos: z.number().optional().describe('插入位置，不填则在当前光标位置插入'),
    }),
    execute: (editor: Editor) => async (params: { source: string; startTime?: number; pos?: number }) => {
        try {
            let bvid: string | null = null;

            // Extract BV ID from either direct BV ID or URL
            if (isValidBvid(params.source)) {
                bvid = params.source;
            } else {
                bvid = extractBvid(params.source);
            }

            if (!bvid) {
                return {
                    success: false,
                    error: '无法识别有效的Bilibili视频BV号，请检查输入的URL或BV号格式'
                };
            }

            const bilibiliNode = {
                type: 'bilibili',
                attrs: {
                    bvid,
                    startTime: params.startTime || 0,
                }
            };

            if (params.pos !== undefined) {
                const docSize = editor.state.doc.nodeSize;
                if (params.pos < 0 || params.pos >= docSize) {
                    return {
                        success: false,
                        error: `位置 ${params.pos} 超出文档范围 (0-${docSize - 1})`
                    };
                }
                editor.chain().focus().insertContentAt(params.pos, bilibiliNode).run();
            } else {
                editor.chain().focus().insertContent(bilibiliNode).run();
            }

            return {
                success: true,
                bvid,
                startTime: params.startTime || 0,
                message: `已插入Bilibili视频: ${bvid}`
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : '插入Bilibili视频失败',
            };
        }
    }
};

/**
 * Tool: Update an existing Bilibili video in the document
 */
export const updateBilibiliVideoTool = {
    name: 'updateBilibiliVideo',
    description: '更新文档中现有的Bilibili视频。需要指定视频的开始时间或其他属性。',
    inputSchema: z.object({
        bvid: z.string().describe('要更新的Bilibili视频的BV号'),
        startTime: z.number().optional().describe('视频开始播放的时间点（秒）'),
        newBvid: z.string().optional().describe('如果要更换视频，则提供新的BV号'),
    }),
    execute: (editor: Editor) => async (params: { bvid: string; startTime?: number; newBvid?: string }) => {
        try {
            // Find the existing node with the given bvid
            let found = false;

            editor.state.doc.descendants((node, pos) => {
                if (node.type.name === 'bilibili' && node.attrs.bvid === params.bvid) {
                    // Update the node with new attributes
                    const newAttrs = {
                        ...node.attrs,
                        bvid: params.newBvid || params.bvid,
                        startTime: params.startTime !== undefined ? params.startTime : node.attrs.startTime,
                    };

                    editor.view.dispatch(
                        editor.view.state.tr.setNodeMarkup(pos, undefined, newAttrs)
                    );

                    found = true;
                    return false; // Stop iteration
                }
            });

            if (!found) {
                return {
                    success: false,
                    error: `未找到BV号为 ${params.bvid} 的Bilibili视频`
                };
            }

            return {
                success: true,
                message: `已更新Bilibili视频: ${params.newBvid || params.bvid}`,
                updatedBvid: params.newBvid || params.bvid,
                startTime: params.startTime !== undefined ? params.startTime : (params.bvid === (params.newBvid || params.bvid) ? undefined : 0)
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : '更新Bilibili视频失败',
            };
        }
    }
};

/**
 * Tool: Get information about Bilibili videos in the document
 */
export const getBilibiliVideosInfoTool = {
    name: 'getBilibiliVideosInfo',
    description: '获取文档中所有Bilibili视频的信息列表。',
    inputSchema: z.object({
        // No parameters needed, just returns all Bilibili videos in the document
    }),
    execute: (editor: Editor) => async () => {
        try {
            const videos: Array<{ bvid: string; startTime: number; pos: number }> = [];

            editor.state.doc.descendants((node, pos) => {
                if (node.type.name === 'bilibili' && node.attrs.bvid) {
                    videos.push({
                        bvid: node.attrs.bvid,
                        startTime: node.attrs.startTime || 0,
                        pos
                    });
                }
            });

            return {
                success: true,
                videos,
                count: videos.length,
                message: `找到 ${videos.length} 个Bilibili视频`
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : '获取Bilibili视频信息失败',
            };
        }
    }
};

/**
 * All Bilibili plugin tools
 */
export const bilibiliTools = [
    insertBilibiliVideoTool,
    updateBilibiliVideoTool,
    getBilibiliVideosInfoTool,
];