/**
 * NetEase Cloud Music Plugin Tools for AI Agent Interaction
 *
 * These tools allow the AI agent to interact with the NetEase Cloud Music embedding system,
 * enabling operations like inserting, updating, and managing music embeds.
 */

import { Editor } from '@kn/editor';
import { z } from '@kn/ui';

/** Extract music ID and type from a NetEase Cloud Music URL */
const parseNeteaseMusicUrl = (url: string): { musicId: string; musicType: 'song' | 'playlist' | 'album' } | null => {
    const patterns: Array<{ regex: RegExp; type: 'song' | 'playlist' | 'album'; idGroup: number }> = [
        { regex: /music\.163\.com(?:\/#)?\/song\?id=(\d+)/, type: 'song', idGroup: 1 },
        { regex: /music\.163\.com(?:\/#)?\/playlist\?id=(\d+)/, type: 'playlist', idGroup: 1 },
        { regex: /music\.163\.com(?:\/#)?\/album\?id=(\d+)/, type: 'album', idGroup: 1 },
        { regex: /y\.music\.163\.com\/m\/song\?id=(\d+)/, type: 'song', idGroup: 1 },
        { regex: /y\.music\.163\.com\/m\/playlist\?id=(\d+)/, type: 'playlist', idGroup: 1 },
        { regex: /y\.music\.163\.com\/m\/album\?id=(\d+)/, type: 'album', idGroup: 1 },
    ];

    for (const { regex, type, idGroup } of patterns) {
        const match = url.match(regex);
        if (match) {
            return { musicId: match[idGroup], musicType: type };
        }
    }
    return null;
};

/**
 * Tool: Insert NetEase Cloud Music into the document
 */
export const insertNeteaseMusicTool = {
    name: 'insertNeteaseMusic',
    description: '在文档中插入网易云音乐。可以提供歌曲/歌单/专辑链接或直接提供ID。',
    inputSchema: z.object({
        source: z.string().describe('网易云音乐的链接或歌曲ID'),
        musicType: z.enum(['song', 'playlist', 'album']).optional().describe('音乐类型：song(歌曲)、playlist(歌单)、album(专辑)，提供ID时需要指定'),
        title: z.string().optional().describe('歌曲/歌单/专辑名称'),
        artist: z.string().optional().describe('歌手名'),
        pos: z.number().optional().describe('插入位置，不填则在当前光标位置插入'),
    }),
    execute: (editor: Editor) => async (params: { source: string; musicType?: string; title?: string; artist?: string; pos?: number }) => {
        try {
            let musicId: string | null = null;
            let musicType: string = params.musicType || 'song';

            // Try parsing as URL first
            const parsed = parseNeteaseMusicUrl(params.source);
            if (parsed) {
                musicId = parsed.musicId;
                musicType = parsed.musicType;
            } else if (/^\d+$/.test(params.source.trim())) {
                musicId = params.source.trim();
            }

            if (!musicId) {
                return {
                    success: false,
                    error: '无法识别有效的网易云音乐ID，请检查输入的URL或ID格式'
                };
            }

            const musicNode = {
                type: 'neteaseMusic',
                attrs: {
                    musicId,
                    musicType,
                    title: params.title || '',
                    artist: params.artist || '',
                    coverUrl: '',
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
                editor.chain().focus().insertContentAt(params.pos, musicNode).run();
            } else {
                editor.chain().focus().insertContent(musicNode).run();
            }

            return {
                success: true,
                musicId,
                musicType,
                message: `已插入网易云音乐: ${musicId} (${musicType})`
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : '插入网易云音乐失败',
            };
        }
    }
};

/**
 * Tool: Update an existing NetEase Music node in the document
 */
export const updateNeteaseMusicTool = {
    name: 'updateNeteaseMusic',
    description: '更新文档中现有的网易云音乐节点属性。',
    inputSchema: z.object({
        musicId: z.string().describe('要更新的音乐ID'),
        newMusicId: z.string().optional().describe('新的音乐ID（如果需要更换）'),
        musicType: z.enum(['song', 'playlist', 'album']).optional().describe('新的音乐类型'),
        title: z.string().optional().describe('新的标题'),
        artist: z.string().optional().describe('新的歌手名'),
    }),
    execute: (editor: Editor) => async (params: { musicId: string; newMusicId?: string; musicType?: string; title?: string; artist?: string }) => {
        try {
            let found = false;

            editor.state.doc.descendants((node, pos) => {
                if (node.type.name === 'neteaseMusic' && node.attrs.musicId === params.musicId) {
                    const newAttrs = {
                        ...node.attrs,
                        musicId: params.newMusicId || params.musicId,
                        musicType: params.musicType || node.attrs.musicType,
                        title: params.title !== undefined ? params.title : node.attrs.title,
                        artist: params.artist !== undefined ? params.artist : node.attrs.artist,
                    };

                    editor.view.dispatch(
                        editor.view.state.tr.setNodeMarkup(pos, undefined, newAttrs)
                    );

                    found = true;
                    return false;
                }
            });

            if (!found) {
                return {
                    success: false,
                    error: `未找到ID为 ${params.musicId} 的网易云音乐节点`
                };
            }

            return {
                success: true,
                message: `已更新网易云音乐: ${params.newMusicId || params.musicId}`,
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : '更新网易云音乐失败',
            };
        }
    }
};

/**
 * Tool: Get information about all NetEase Music nodes in the document
 */
export const getNeteaseMusicInfoTool = {
    name: 'getNeteaseMusicInfo',
    description: '获取文档中所有网易云音乐节点的信息列表。',
    inputSchema: z.object({}),
    execute: (editor: Editor) => async () => {
        try {
            const musicNodes: Array<{ musicId: string; musicType: string; title: string; artist: string; pos: number }> = [];

            editor.state.doc.descendants((node, pos) => {
                if (node.type.name === 'neteaseMusic' && node.attrs.musicId) {
                    musicNodes.push({
                        musicId: node.attrs.musicId,
                        musicType: node.attrs.musicType || 'song',
                        title: node.attrs.title || '',
                        artist: node.attrs.artist || '',
                        pos,
                    });
                }
            });

            return {
                success: true,
                musicNodes,
                count: musicNodes.length,
                message: `找到 ${musicNodes.length} 个网易云音乐节点`
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : '获取网易云音乐信息失败',
            };
        }
    }
};

/**
 * All NetEase Music plugin tools
 */
export const neteaseMusicTools = [
    insertNeteaseMusicTool,
    updateNeteaseMusicTool,
    getNeteaseMusicInfoTool,
];
