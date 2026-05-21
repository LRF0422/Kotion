import { ExtensionWrapper, resolveBlockInsertPosition } from "@kn/common";
import { Drawnix, DrawnixData, MindmapNodeData, convertToPlaitElement, extractMindmapStructure, addChildToNode, deleteNodeById, updateNodeText } from "./drawnix";
import { Paintbrush2 } from "@kn/icon";
import React from "react";
import { z } from "@kn/ui";
import { nanoid } from "nanoid";
import { Editor } from "@kn/editor";
import { parseMarkdownToDrawnix } from "@plait-board/markdown-to-drawnix";
import { parseMermaidToDrawnix } from "@plait-board/mermaid-to-drawnix";
import { drawnixSkill } from "./skills/drawnix-skill";

// Helper: Find all drawnix nodes in document
function findAllDrawnixNodes(editor: Editor): Array<{ pos: number; data: any }> {
    const results: Array<{ pos: number; data: any }> = [];
    editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'drawnix') {
            results.push({
                pos,
                data: node.attrs.data
            });
        }
    });
    return results;
}

// Helper: Get drawnix node at position
function getDrawnixAtPos(editor: Editor, pos: number): { node: any; data: any } | null {
    const node = editor.state.doc.nodeAt(pos);
    if (!node || node.type.name !== 'drawnix') {
        return null;
    }
    return {
        node,
        data: node.attrs.data
    };
}

export const DrawnixExtension: ExtensionWrapper = {
    name: 'drawnix',
    extendsion: [Drawnix],
    slashConfig: [
        {
            icon: <Paintbrush2 className="h-4 w-4" />,
            text: 'drawnix',
            slash: '/drawnix',
            action: (editor) => {
                editor.chain().focus().insertDrawnix().run()
            }
        }
    ],
    tools: [
        // Tool 1: Insert empty drawnix mindmap
        {
            name: 'insertDrawnix',
            description: `插入一个新的思维导图。可以在指定位置插入空白思维导图

插入位置定位（优先级从高到低）：
1. nearText + placement：在包含指定文本的块之前/之后插入（推荐，最精确）
2. blockIndex：在指定块索引之后插入
3. position：使用 ProseMirror 绝对位置，默认吸附到块边界`,
            inputSchema: z.object({
                nearText: z.string().describe("搜索文档中包含此文本的块，在该块附近插入（优先使用此参数定位）").optional(),
                placement: z.enum(['before', 'after']).describe("插入位置：'before' 在匹配块之前，'after' 在匹配块之后。默认 'after'").optional(),
                blockIndex: z.number().describe("在该块索引之后插入（从0开始）").optional(),
                position: z.number().optional().describe('插入位置（ProseMirror 绝对位置），推荐使用 nearText 代替')
            }),
            execute: (editor: Editor) => async (params: {
                nearText?: string;
                placement?: 'before' | 'after';
                blockIndex?: number;
                position?: number;
            }) => {
                const { nearText, placement, blockIndex, position } = params;

                const resolved = resolveBlockInsertPosition(editor, 'drawnix', {
                    nearText, placement, blockIndex, position
                });

                if (resolved) {
                    if (resolved.pos === -1) {
                        if (resolved.strategy === 'nearText-not-found') {
                            return { error: `未找到包含 "${nearText}" 的块。请使用 getDocumentStructure 查看文档结构` };
                        }
                        if (resolved.strategy === 'blockIndex-out-of-range') {
                            return { error: '块索引越界，请使用 getDocumentStructure 查看文档结构' };
                        }
                        return { error: '插入位置超出文档范围' };
                    }
                    editor.chain().focus().insertContentAt(resolved.pos, { type: 'drawnix' }).run();
                } else {
                    editor.chain().focus().insertDrawnix().run();
                }

                return {
                    success: true,
                    message: '已插入空白思维导图'
                };
            }
        },

        // Tool 2: Insert drawnix with structured data
        {
            name: 'insertDrawnixFromStructure',
            description: `根据JSON结构创建并插入思维导图。结构包含根节点文本和子节点数组

插入位置定位（优先级从高到低）：
1. nearText + placement：在包含指定文本的块之前/之后插入（推荐）
2. blockIndex：在指定块索引之后插入
3. position：使用 ProseMirror 绝对位置`,
            inputSchema: z.object({
                rootText: z.string().describe('根节点文本'),
                children: z.array(
                    z.object({
                        text: z.string().describe('节点文本'),
                        children: z.array(z.any()).optional().describe('子节点数组')
                    })
                ).optional().describe('子节点数组'),
                nearText: z.string().describe("搜索文档中包含此文本的块，在该块附近插入").optional(),
                placement: z.enum(['before', 'after']).describe("插入位置：'before' 或 'after'，默认 'after'").optional(),
                blockIndex: z.number().describe("在该块索引之后插入").optional(),
                position: z.number().optional().describe('插入位置（ProseMirror 绝对位置）')
            }),
            execute: (editor: Editor) => async (params: {
                rootText: string;
                children?: Array<{ text: string; children?: any[] }>;
                nearText?: string;
                placement?: 'before' | 'after';
                blockIndex?: number;
                position?: number;
            }) => {
                const { rootText, children = [], nearText, placement, blockIndex, position } = params;

                // Build mindmap structure
                const buildNode = (item: { text: string; children?: any[] }): MindmapNodeData => ({
                    id: nanoid(6),
                    text: item.text,
                    children: item.children?.map(buildNode)
                });

                const rootNode: MindmapNodeData = {
                    id: nanoid(6),
                    text: rootText,
                    children: children.map(buildNode)
                };

                const plaitElement = convertToPlaitElement(rootNode, true);
                const data: DrawnixData = {
                    children: [plaitElement]
                };

                const drawnixNode = {
                    type: 'drawnix' as const,
                    attrs: { data }
                };

                const resolved = resolveBlockInsertPosition(editor, 'drawnix', {
                    nearText, placement, blockIndex, position
                });

                if (resolved) {
                    if (resolved.pos === -1) {
                        if (resolved.strategy === 'nearText-not-found') {
                            return { error: `未找到包含 "${nearText}" 的块` };
                        }
                        return { error: '插入位置无效' };
                    }
                    editor.chain().focus().insertContentAt(resolved.pos, drawnixNode).run();
                } else {
                    editor.chain().focus().insertDrawnixWithData(data).run();
                }

                return {
                    success: true,
                    message: `已创建思维导图，根节点: "${rootText}"，包含 ${children.length} 个子节点`,
                    rootId: rootNode.id
                };
            }
        },

        // Tool 3: Insert drawnix from markdown outline
        {
            name: 'insertDrawnixFromMarkdown',
            description: `将Markdown大纲格式转换为思维导图并插入。支持标准Markdown标题格式（# ## ### 等）和列表格式（- 或 *）

插入位置定位（优先级从高到低）：
1. nearText + placement：在包含指定文本的块之前/之后插入（推荐）
2. blockIndex：在指定块索引之后插入
3. position：使用 ProseMirror 绝对位置`,
            inputSchema: z.object({
                markdown: z.string().describe('Markdown格式的大纲文本，支持标题(#)和列表(-)格式'),
                nearText: z.string().describe("搜索文档中包含此文本的块，在该块附近插入").optional(),
                placement: z.enum(['before', 'after']).describe("插入位置：'before' 或 'after'，默认 'after'").optional(),
                blockIndex: z.number().describe("在该块索引之后插入").optional(),
                position: z.number().optional().describe('插入位置（ProseMirror 绝对位置）')
            }),
            execute: (editor: Editor) => async (params: { markdown: string; nearText?: string; placement?: 'before' | 'after'; blockIndex?: number; position?: number }) => {
                const { markdown, nearText, placement, blockIndex, position } = params;

                try {
                    const mindData = parseMarkdownToDrawnix(markdown);

                    if (!mindData || !mindData.children || mindData.children.length === 0) {
                        return { error: '无法解析Markdown内容，请确保格式正确' };
                    }

                    const data: DrawnixData = {
                        children: mindData.children
                    };

                    const drawnixNode = {
                        type: 'drawnix' as const,
                        attrs: { data }
                    };

                    const resolved = resolveBlockInsertPosition(editor, 'drawnix', {
                        nearText, placement, blockIndex, position
                    });

                    if (resolved) {
                        if (resolved.pos === -1) {
                            if (resolved.strategy === 'nearText-not-found') {
                                return { error: `未找到包含 "${nearText}" 的块` };
                            }
                            return { error: '插入位置无效' };
                        }
                        editor.chain().focus().insertContentAt(resolved.pos, drawnixNode).run();
                    } else {
                        editor.chain().focus().insertDrawnixWithData(data).run();
                    }

                    return {
                        success: true,
                        message: '已从Markdown创建思维导图'
                    };
                } catch (error) {
                    return {
                        error: `Markdown解析失败: ${error instanceof Error ? error.message : '未知错误'}`
                    };
                }
            }
        },

        // Tool 4: Insert drawnix from mermaid
        {
            name: 'insertDrawnixFromMermaid',
            description: `将Mermaid图表代码转换为思维导图并插入。支持mindmap和flowchart语法

插入位置定位（优先级从高到低）：
1. nearText + placement：在包含指定文本的块之前/之后插入（推荐）
2. blockIndex：在指定块索引之后插入
3. position：使用 ProseMirror 绝对位置`,
            inputSchema: z.object({
                mermaid: z.string().describe('Mermaid格式的图表代码'),
                nearText: z.string().describe("搜索文档中包含此文本的块，在该块附近插入").optional(),
                placement: z.enum(['before', 'after']).describe("插入位置：'before' 或 'after'，默认 'after'").optional(),
                blockIndex: z.number().describe("在该块索引之后插入").optional(),
                position: z.number().optional().describe('插入位置（ProseMirror 绝对位置）')
            }),
            execute: (editor: Editor) => async (params: { mermaid: string; nearText?: string; placement?: 'before' | 'after'; blockIndex?: number; position?: number }) => {
                const { mermaid, nearText, placement, blockIndex, position } = params;

                try {
                    const mindData = await parseMermaidToDrawnix(mermaid);

                    // @ts-ignore
                    if (!mindData || !mindData.children || mindData.children.length === 0) {
                        return { error: '无法解析Mermaid代码，请确保语法正确' };
                    }

                    const data: DrawnixData = {
                        // @ts-ignore
                        children: mindData.children
                    };

                    const drawnixNode = {
                        type: 'drawnix' as const,
                        attrs: { data }
                    };

                    const resolved = resolveBlockInsertPosition(editor, 'drawnix', {
                        nearText, placement, blockIndex, position
                    });

                    if (resolved) {
                        if (resolved.pos === -1) {
                            if (resolved.strategy === 'nearText-not-found') {
                                return { error: `未找到包含 "${nearText}" 的块` };
                            }
                            return { error: '插入位置无效' };
                        }
                        editor.chain().focus().insertContentAt(resolved.pos, drawnixNode).run();
                    } else {
                        editor.chain().focus().insertDrawnixWithData(data).run();
                    }

                    return {
                        success: true,
                        message: '已从Mermaid创建思维导图'
                    };
                } catch (error) {
                    return {
                        error: `Mermaid解析失败: ${error instanceof Error ? error.message : '未知错误'}`
                    };
                }
            }
        },

        // Tool 5: Get drawnix data at position
        {
            name: 'getDrawnixAtPos',
            description: '获取指定位置的思维导图数据，返回结构化的节点信息',
            inputSchema: z.object({
                pos: z.number().describe('思维导图节点在文档中的位置')
            }),
            execute: (editor: Editor) => async (params: { pos: number }) => {
                const { pos } = params;

                const result = getDrawnixAtPos(editor, pos);
                if (!result) {
                    return { error: `位置 ${pos} 没有找到思维导图节点` };
                }

                // Extract readable structure
                const data = result.data;
                if (!data?.children?.[0]) {
                    return {
                        success: true,
                        pos,
                        isEmpty: true,
                        message: '找到空的思维导图'
                    };
                }

                const structure = extractMindmapStructure(data.children[0]);

                return {
                    success: true,
                    pos,
                    structure,
                    message: `找到思维导图，根节点: "${structure.text}"`
                };
            }
        },

        // Tool 6: List all drawnix in document
        {
            name: 'listAllDrawnix',
            description: '列出文档中所有思维导图及其位置和根节点信息',
            inputSchema: z.object({}),
            execute: (editor: Editor) => async () => {
                const nodes = findAllDrawnixNodes(editor);

                if (nodes.length === 0) {
                    return {
                        success: true,
                        count: 0,
                        message: '文档中没有思维导图'
                    };
                }

                const items = nodes.map((item, index) => {
                    const rootNode = item.data?.children?.[0];
                    const rootText = rootNode?.data?.topic?.children?.[0]?.text || '(空)';
                    const childCount = rootNode?.children?.length || 0;

                    return {
                        index,
                        pos: item.pos,
                        rootText,
                        childCount
                    };
                });

                return {
                    success: true,
                    count: nodes.length,
                    items,
                    message: `找到 ${nodes.length} 个思维导图`
                };
            }
        },

        // Tool 7: Add node to drawnix
        {
            name: 'addNodeToDrawnix',
            description: '向思维导图中添加新节点。可以添加到根节点或指定父节点下',
            inputSchema: z.object({
                pos: z.number().describe('思维导图在文档中的位置'),
                parentId: z.string().describe('父节点ID，添加到该节点下'),
                text: z.string().describe('新节点的文本内容'),
                children: z.array(
                    z.object({
                        text: z.string(),
                        children: z.array(z.any()).optional()
                    })
                ).optional().describe('新节点的子节点（可选）')
            }),
            execute: (editor: Editor) => async (params: {
                pos: number;
                parentId: string;
                text: string;
                children?: Array<{ text: string; children?: any[] }>;
            }) => {
                const { pos, parentId, text, children = [] } = params;

                const result = getDrawnixAtPos(editor, pos);
                if (!result) {
                    return { error: `位置 ${pos} 没有找到思维导图节点` };
                }

                const data = result.data;
                if (!data?.children) {
                    return { error: '思维导图数据为空' };
                }

                const buildNode = (item: { text: string; children?: any[] }): MindmapNodeData => ({
                    id: nanoid(6),
                    text: item.text,
                    children: item.children?.map(buildNode)
                });

                const newNode: MindmapNodeData = {
                    id: nanoid(6),
                    text,
                    children: children.map(buildNode)
                };

                const newChildren = addChildToNode(data.children, parentId, newNode);
                if (!newChildren) {
                    return { error: `未找到父节点 ID: ${parentId}` };
                }

                const newData: DrawnixData = {
                    children: newChildren,
                    viewport: data.viewport
                };

                editor.chain().focus().updateDrawnixAtPos(pos, newData).run();

                return {
                    success: true,
                    newNodeId: newNode.id,
                    message: `已添加节点 "${text}" 到父节点 ${parentId}`
                };
            }
        },

        // Tool 8: Delete node from drawnix
        {
            name: 'deleteNodeFromDrawnix',
            description: '从思维导图中删除指定节点及其所有子节点。注意：不能删除根节点',
            inputSchema: z.object({
                pos: z.number().describe('思维导图在文档中的位置'),
                nodeId: z.string().describe('要删除的节点ID')
            }),
            execute: (editor: Editor) => async (params: { pos: number; nodeId: string }) => {
                const { pos, nodeId } = params;

                const result = getDrawnixAtPos(editor, pos);
                if (!result) {
                    return { error: `位置 ${pos} 没有找到思维导图节点` };
                }

                const data = result.data;
                if (!data?.children) {
                    return { error: '思维导图数据为空' };
                }

                const newChildren = deleteNodeById(data.children, nodeId);
                if (!newChildren) {
                    return { error: `未找到节点 ID: ${nodeId}，或尝试删除根节点` };
                }

                const newData: DrawnixData = {
                    children: newChildren,
                    viewport: data.viewport
                };

                editor.chain().focus().updateDrawnixAtPos(pos, newData).run();

                return {
                    success: true,
                    message: `已删除节点 ${nodeId}`
                };
            }
        },

        // Tool 9: Update node text
        {
            name: 'updateDrawnixNodeText',
            description: '更新思维导图中指定节点的文本内容',
            inputSchema: z.object({
                pos: z.number().describe('思维导图在文档中的位置'),
                nodeId: z.string().describe('要更新的节点ID'),
                newText: z.string().describe('新的文本内容')
            }),
            execute: (editor: Editor) => async (params: { pos: number; nodeId: string; newText: string }) => {
                const { pos, nodeId, newText } = params;

                const result = getDrawnixAtPos(editor, pos);
                if (!result) {
                    return { error: `位置 ${pos} 没有找到思维导图节点` };
                }

                const data = result.data;
                if (!data?.children) {
                    return { error: '思维导图数据为空' };
                }

                const newChildren = updateNodeText(data.children, nodeId, newText);
                if (!newChildren) {
                    return { error: `未找到节点 ID: ${nodeId}` };
                }

                const newData: DrawnixData = {
                    children: newChildren,
                    viewport: data.viewport
                };

                editor.chain().focus().updateDrawnixAtPos(pos, newData).run();

                return {
                    success: true,
                    message: `已更新节点 ${nodeId} 的文本为 "${newText}"`
                };
            }
        }
    ],
    skills: [drawnixSkill]
}