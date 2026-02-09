import React from "react";
import { ExtensionWrapper } from "@kn/common";
import { Excalidraw } from "./excalidraw";
import { PaintBucket } from "@kn/icon";
import { z } from "@kn/ui";
import type { Editor } from "@kn/editor";

// ============================================================
// Helper: Generate unique element IDs
// ============================================================
const generateId = () => Math.random().toString(36).substring(2, 10);

// ============================================================
// Helper: Find all excalidraw nodes in the document
// ============================================================
const findExcalidrawNodes = (editor: Editor) => {
    const nodes: Array<{ pos: number; elements: any[]; appState: Record<string, any>; nodeSize: number }> = [];
    editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'excalidraw') {
            nodes.push({
                pos,
                elements: node.attrs.elements || [],
                appState: node.attrs.appState || {},
                nodeSize: node.nodeSize
            });
        }
    });
    return nodes;
};

// ============================================================
// Helper: Create base Excalidraw element with defaults
// ============================================================
const createBaseElement = (overrides: Record<string, any> = {}) => ({
    id: generateId(),
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    angle: 0,
    strokeColor: "#1e1e1e",
    backgroundColor: "transparent",
    seed: Math.floor(Math.random() * 2000000000),
    groupIds: [],
    frameId: null,
    roundness: null,
    boundElements: [],
    updated: Date.now(),
    link: null,
    locked: false,
    isDeleted: false,
    version: 1,
    versionNonce: Math.floor(Math.random() * 2000000000),
    ...overrides
});

// ============================================================
// Shape factory functions
// ============================================================
const createRectangle = (
    x: number, y: number, width: number, height: number,
    overrides: Record<string, any> = {}
) => createBaseElement({
    type: "rectangle",
    x, y, width, height,
    roundness: { type: 3 },
    ...overrides
});

const createEllipse = (
    x: number, y: number, width: number, height: number,
    overrides: Record<string, any> = {}
) => createBaseElement({
    type: "ellipse",
    x, y, width, height,
    ...overrides
});

const createDiamond = (
    x: number, y: number, width: number, height: number,
    overrides: Record<string, any> = {}
) => createBaseElement({
    type: "diamond",
    x, y, width, height,
    ...overrides
});

const createText = (
    x: number, y: number, text: string,
    overrides: Record<string, any> = {}
) => createBaseElement({
    type: "text",
    x, y,
    width: text.length * 10,
    height: 25,
    text,
    fontSize: 20,
    fontFamily: 1,
    textAlign: "center",
    verticalAlign: "middle",
    baseline: 18,
    containerId: null,
    originalText: text,
    autoResize: true,
    lineHeight: 1.25,
    ...overrides
});

const createArrow = (
    points: [number, number][],
    overrides: Record<string, any> = {}
) => {
    const startX = points[0][0];
    const startY = points[0][1];
    const normalizedPoints = points.map(([px, py]) => [px - startX, py - startY]);
    const lastPoint = normalizedPoints[normalizedPoints.length - 1];
    return createBaseElement({
        type: "arrow",
        x: startX,
        y: startY,
        width: Math.abs(lastPoint[0]),
        height: Math.abs(lastPoint[1]),
        points: normalizedPoints,
        startBinding: null,
        endBinding: null,
        startArrowhead: null,
        endArrowhead: "arrow",
        ...overrides
    });
};

// ============================================================
// Excalidraw templates
// ============================================================
const EXCALIDRAW_TEMPLATES: Record<string, { description: string; build: () => any[] }> = {
    flowchart: {
        description: "流程图：开始 → 判断 → 结果 → 结束",
        build: () => {
            const startId = generateId();
            const decisionId = generateId();
            const result1Id = generateId();
            const result2Id = generateId();
            const endId = generateId();

            const startBox = createRectangle(200, 50, 120, 50, {
                id: startId, backgroundColor: "#a5d8ff", roundness: { type: 3 }
            });
            const startLabel = createText(220, 62, "Start", { containerId: startId });

            const decisionBox = createDiamond(195, 160, 130, 100, {
                id: decisionId, backgroundColor: "#ffec99"
            });
            const decisionLabel = createText(220, 195, "Decision?", { containerId: decisionId });

            const result1Box = createRectangle(50, 320, 120, 50, {
                id: result1Id, backgroundColor: "#b2f2bb"
            });
            const result1Label = createText(70, 332, "Result 1", { containerId: result1Id });

            const result2Box = createRectangle(350, 320, 120, 50, {
                id: result2Id, backgroundColor: "#ffc9c9"
            });
            const result2Label = createText(370, 332, "Result 2", { containerId: result2Id });

            const endBox = createRectangle(200, 430, 120, 50, {
                id: endId, backgroundColor: "#d0bfff", roundness: { type: 3 }
            });
            const endLabel = createText(230, 442, "End", { containerId: endId });

            const arrow1 = createArrow([[260, 100], [260, 160]]);
            const arrow2 = createArrow([[195, 210], [110, 320]]);
            const arrow2Label = createText(120, 260, "Yes", { fontSize: 14 });
            const arrow3 = createArrow([[325, 210], [410, 320]]);
            const arrow3Label = createText(360, 260, "No", { fontSize: 14 });
            const arrow4 = createArrow([[110, 370], [260, 430]]);
            const arrow5 = createArrow([[410, 370], [260, 430]]);

            return [
                startBox, startLabel, decisionBox, decisionLabel,
                result1Box, result1Label, result2Box, result2Label,
                endBox, endLabel,
                arrow1, arrow2, arrow2Label, arrow3, arrow3Label, arrow4, arrow5
            ];
        }
    },

    architecture: {
        description: "架构图：客户端/服务端/数据库 三层架构",
        build: () => {
            const clientId = generateId();
            const serverId = generateId();
            const dbId = generateId();

            const clientBox = createRectangle(50, 100, 160, 80, {
                id: clientId, backgroundColor: "#a5d8ff"
            });
            const clientLabel = createText(80, 125, "Client", { containerId: clientId, fontSize: 18 });

            const serverBox = createRectangle(300, 100, 160, 80, {
                id: serverId, backgroundColor: "#b2f2bb"
            });
            const serverLabel = createText(330, 125, "Server", { containerId: serverId, fontSize: 18 });

            const dbBox = createRectangle(550, 100, 160, 80, {
                id: dbId, backgroundColor: "#ffec99"
            });
            const dbLabel = createText(570, 125, "Database", { containerId: dbId, fontSize: 18 });

            const arrow1 = createArrow([[210, 130], [300, 130]]);
            const arrow1Label = createText(230, 108, "HTTP", { fontSize: 14 });
            const arrow2 = createArrow([[460, 130], [550, 130]]);
            const arrow2Label = createText(480, 108, "SQL", { fontSize: 14 });
            const arrow3 = createArrow([[550, 150], [460, 150]]);
            const arrow3Label = createText(480, 155, "Data", { fontSize: 14 });
            const arrow4 = createArrow([[300, 150], [210, 150]]);
            const arrow4Label = createText(230, 155, "JSON", { fontSize: 14 });

            const title = createText(280, 30, "Architecture Diagram", { fontSize: 24 });

            return [
                clientBox, clientLabel, serverBox, serverLabel, dbBox, dbLabel,
                arrow1, arrow1Label, arrow2, arrow2Label,
                arrow3, arrow3Label, arrow4, arrow4Label, title
            ];
        }
    },

    mindmap: {
        description: "思维导图：中心主题 + 4个分支",
        build: () => {
            const centerId = generateId();
            const centerBox = createEllipse(250, 180, 160, 80, {
                id: centerId, backgroundColor: "#a5d8ff"
            });
            const centerLabel = createText(280, 205, "Main Topic", { containerId: centerId, fontSize: 18 });

            const branch1Id = generateId();
            const branch1Box = createRectangle(50, 30, 140, 50, {
                id: branch1Id, backgroundColor: "#b2f2bb", roundness: { type: 3 }
            });
            const branch1Label = createText(75, 42, "Branch 1", { containerId: branch1Id });

            const branch2Id = generateId();
            const branch2Box = createRectangle(470, 30, 140, 50, {
                id: branch2Id, backgroundColor: "#ffec99", roundness: { type: 3 }
            });
            const branch2Label = createText(495, 42, "Branch 2", { containerId: branch2Id });

            const branch3Id = generateId();
            const branch3Box = createRectangle(50, 350, 140, 50, {
                id: branch3Id, backgroundColor: "#ffc9c9", roundness: { type: 3 }
            });
            const branch3Label = createText(75, 362, "Branch 3", { containerId: branch3Id });

            const branch4Id = generateId();
            const branch4Box = createRectangle(470, 350, 140, 50, {
                id: branch4Id, backgroundColor: "#d0bfff", roundness: { type: 3 }
            });
            const branch4Label = createText(495, 362, "Branch 4", { containerId: branch4Id });

            const arrow1 = createArrow([[250, 200], [190, 55]]);
            const arrow2 = createArrow([[410, 200], [470, 55]]);
            const arrow3 = createArrow([[250, 260], [190, 375]]);
            const arrow4 = createArrow([[410, 260], [470, 375]]);

            return [
                centerBox, centerLabel,
                branch1Box, branch1Label, branch2Box, branch2Label,
                branch3Box, branch3Label, branch4Box, branch4Label,
                arrow1, arrow2, arrow3, arrow4
            ];
        }
    },

    sequence: {
        description: "时序图：参与者之间的请求/响应流",
        build: () => {
            const p1Id = generateId();
            const p1Box = createRectangle(80, 50, 120, 50, {
                id: p1Id, backgroundColor: "#a5d8ff"
            });
            const p1Label = createText(105, 62, "Client", { containerId: p1Id });

            const p2Id = generateId();
            const p2Box = createRectangle(380, 50, 120, 50, {
                id: p2Id, backgroundColor: "#b2f2bb"
            });
            const p2Label = createText(405, 62, "Server", { containerId: p2Id });

            // Lifelines (vertical arrows)
            const lifeline1 = createArrow([[140, 100], [140, 380]], { strokeStyle: "dashed", endArrowhead: null });
            const lifeline2 = createArrow([[440, 100], [440, 380]], { strokeStyle: "dashed", endArrowhead: null });

            // Messages
            const msg1 = createArrow([[140, 150], [440, 150]]);
            const msg1Label = createText(240, 128, "Request", { fontSize: 14 });

            const msg2 = createArrow([[440, 210], [140, 210]], { strokeStyle: "dashed" });
            const msg2Label = createText(240, 188, "Response", { fontSize: 14 });

            const msg3 = createArrow([[140, 270], [440, 270]]);
            const msg3Label = createText(240, 248, "Request 2", { fontSize: 14 });

            const msg4 = createArrow([[440, 330], [140, 330]], { strokeStyle: "dashed" });
            const msg4Label = createText(240, 308, "Response 2", { fontSize: 14 });

            return [
                p1Box, p1Label, p2Box, p2Label,
                lifeline1, lifeline2,
                msg1, msg1Label, msg2, msg2Label,
                msg3, msg3Label, msg4, msg4Label
            ];
        }
    },

    shapes: {
        description: "基础形状展示：矩形、椭圆、菱形、文本",
        build: () => {
            const rect = createRectangle(50, 50, 150, 80, { backgroundColor: "#a5d8ff" });
            const rectLabel = createText(80, 77, "Rectangle", { fontSize: 16 });

            const ellipse = createEllipse(280, 50, 150, 80, { backgroundColor: "#b2f2bb" });
            const ellipseLabel = createText(310, 77, "Ellipse", { fontSize: 16 });

            const diamond = createDiamond(490, 40, 130, 100, { backgroundColor: "#ffec99" });
            const diamondLabel = createText(510, 77, "Diamond", { fontSize: 16 });

            const title = createText(220, 10, "Basic Shapes", { fontSize: 24 });

            const textEl = createText(180, 200, "Text Element", { fontSize: 20, backgroundColor: "#ffc9c9" });

            const arrow = createArrow([[50, 180], [200, 180]]);
            const arrowLabel = createText(90, 158, "Arrow", { fontSize: 14 });

            return [rect, rectLabel, ellipse, ellipseLabel, diamond, diamondLabel, title, textEl, arrow, arrowLabel];
        }
    }
};

const TEMPLATE_TYPES = Object.keys(EXCALIDRAW_TEMPLATES) as Array<keyof typeof EXCALIDRAW_TEMPLATES>;

// ============================================================
// Extension definition
// ============================================================
export const ExcalidrawExtension: ExtensionWrapper = {
    name: 'excalidraw',
    extendsion: [Excalidraw],
    slashConfig: [
        {
            text: 'excalidraw',
            icon: <PaintBucket className="h-4 w-4" />,
            slash: '/excalidraw',
            action: (editor) => {
                editor.commands.insertExcalidraw()
            }
        }
    ],
    tools: [
        // Tool 1: Insert Excalidraw Diagram
        {
            name: 'insertExcalidrawDiagram',
            description: `插入 Excalidraw 手绘风格图表。支持以下模板类型：
- flowchart: 流程图，展示流程和决策
- architecture: 架构图，展示系统分层结构
- mindmap: 思维导图，展示中心主题和分支
- sequence: 时序图，展示参与者之间的交互
- shapes: 基础形状展示

可以直接使用模板，也可以传入自定义 elements 数组来创建自定义图表。
每个 element 需要包含 type、x、y、width、height 等属性。
支持的 element 类型：rectangle、ellipse、diamond、text、arrow、line、freedraw。`,
            inputSchema: z.object({
                elements: z.array(z.any()).describe("Excalidraw 元素数组。每个元素需包含 type, x, y, width, height 等属性。如不提供，将根据 templateType 使用模板").optional(),
                templateType: z.enum(['flowchart', 'architecture', 'mindmap', 'sequence', 'shapes'] as const).describe("模板类型。用于生成预设图表").optional(),
                position: z.number().describe("插入位置。如不指定则插入到当前光标位置或文档末尾").optional()
            }),
            execute: (editor: Editor) => async (params: {
                elements?: any[];
                templateType?: string;
                position?: number;
            }) => {
                try {
                    const { elements, templateType, position } = params;

                    // Determine elements to use
                    let finalElements: any[] = [];
                    let usedTemplate = 'custom';

                    if (elements && elements.length > 0) {
                        // Use provided elements, ensuring each has required defaults
                        finalElements = elements.map(el => createBaseElement(el));
                    } else if (templateType && EXCALIDRAW_TEMPLATES[templateType]) {
                        finalElements = EXCALIDRAW_TEMPLATES[templateType].build();
                        usedTemplate = templateType;
                    } else {
                        // Default to flowchart template
                        finalElements = EXCALIDRAW_TEMPLATES.flowchart.build();
                        usedTemplate = 'flowchart';
                    }

                    // Insert at specified position or use command
                    if (position !== undefined) {
                        const docSize = editor.state.doc.nodeSize;
                        if (position < 0 || position > docSize - 2) {
                            return {
                                success: false,
                                error: `Invalid position: ${position}. Document size is ${docSize}`
                            };
                        }
                        editor.chain()
                            .focus()
                            .insertContentAt(position, {
                                type: 'excalidraw',
                                attrs: {
                                    elements: finalElements,
                                    appState: { isLoading: false }
                                }
                            })
                            .run();
                    } else {
                        editor.commands.insertExcalidraw(finalElements);
                    }

                    return {
                        success: true,
                        message: `Excalidraw diagram inserted successfully`,
                        templateType: usedTemplate,
                        elementCount: finalElements.length,
                        elementTypes: [...new Set(finalElements.map((el: any) => el.type))]
                    };
                } catch (error) {
                    return {
                        success: false,
                        error: `Failed to insert excalidraw diagram: ${error instanceof Error ? error.message : String(error)}`
                    };
                }
            }
        },

        // Tool 2: List All Excalidraw Diagrams
        {
            name: 'listExcalidrawDiagrams',
            description: '列出文档中所有的 Excalidraw 图表，返回每个图表的位置、元素数量和类型统计。用于在更新或删除图表前了解文档中已有的图表。',
            inputSchema: z.object({}),
            execute: (editor: Editor) => async () => {
                try {
                    const excalidrawNodes = findExcalidrawNodes(editor);

                    if (excalidrawNodes.length === 0) {
                        return {
                            success: true,
                            count: 0,
                            diagrams: [],
                            message: 'No excalidraw diagrams found in the document'
                        };
                    }

                    const diagrams = excalidrawNodes.map((node, index) => {
                        const elements = node.elements || [];
                        const typeStats: Record<string, number> = {};
                        elements.forEach((el: any) => {
                            const t = el.type || 'unknown';
                            typeStats[t] = (typeStats[t] || 0) + 1;
                        });

                        return {
                            index,
                            position: node.pos,
                            nodeSize: node.nodeSize,
                            elementCount: elements.length,
                            typeStats,
                            hasElements: elements.length > 0
                        };
                    });

                    return {
                        success: true,
                        count: diagrams.length,
                        diagrams,
                        message: `Found ${diagrams.length} excalidraw diagram(s) in the document`
                    };
                } catch (error) {
                    return {
                        success: false,
                        error: `Failed to list excalidraw diagrams: ${error instanceof Error ? error.message : String(error)}`
                    };
                }
            }
        },

        // Tool 3: Update Excalidraw Diagram
        {
            name: 'updateExcalidrawDiagram',
            description: '更新文档中指定位置的 Excalidraw 图表。需要先使用 listExcalidrawDiagrams 获取图表位置。支持替换或追加模式。',
            inputSchema: z.object({
                position: z.number().describe("要更新的 Excalidraw 图表的位置（通过 listExcalidrawDiagrams 获取）"),
                elements: z.array(z.any()).describe("新的 Excalidraw 元素数组"),
                mode: z.enum(['replace', 'append']).describe("更新模式：replace 完全替换，append 追加到现有元素").optional()
            }),
            execute: (editor: Editor) => async (params: {
                position: number;
                elements: any[];
                mode?: 'replace' | 'append';
            }) => {
                try {
                    const { position, elements, mode = 'replace' } = params;

                    // Find the excalidraw node at the specified position
                    const excalidrawNodes = findExcalidrawNodes(editor);
                    const targetNode = excalidrawNodes.find(node => node.pos === position);

                    if (!targetNode) {
                        return {
                            success: false,
                            error: `No excalidraw diagram found at position ${position}. Use listExcalidrawDiagrams to find available diagrams.`,
                            availablePositions: excalidrawNodes.map(n => n.pos)
                        };
                    }

                    const node = editor.state.doc.nodeAt(position);
                    if (!node || node.type.name !== 'excalidraw') {
                        return {
                            success: false,
                            error: `Invalid node at position ${position}`
                        };
                    }

                    // Determine final elements
                    const newElements = elements.map(el => createBaseElement(el));
                    let finalElements: any[];
                    if (mode === 'append') {
                        finalElements = [...(targetNode.elements || []), ...newElements];
                    } else {
                        finalElements = newElements;
                    }

                    // Create new node with updated attributes
                    const tr = editor.state.tr;
                    const newNode = node.type.create({
                        ...node.attrs,
                        elements: finalElements
                    });
                    tr.replaceWith(position, position + node.nodeSize, newNode);
                    editor.view.dispatch(tr);

                    return {
                        success: true,
                        message: `Excalidraw diagram updated successfully (${mode} mode)`,
                        position,
                        previousElementCount: targetNode.elements.length,
                        newElementCount: finalElements.length,
                        mode
                    };
                } catch (error) {
                    return {
                        success: false,
                        error: `Failed to update excalidraw diagram: ${error instanceof Error ? error.message : String(error)}`
                    };
                }
            }
        },

        // Tool 4: Delete Excalidraw Diagram
        {
            name: 'deleteExcalidrawDiagram',
            description: '删除文档中指定位置的 Excalidraw 图表。需要先使用 listExcalidrawDiagrams 获取图表位置。',
            inputSchema: z.object({
                position: z.number().describe("要删除的 Excalidraw 图表的位置（通过 listExcalidrawDiagrams 获取）")
            }),
            execute: (editor: Editor) => async (params: { position: number }) => {
                try {
                    const { position } = params;

                    // Find the excalidraw node at the specified position
                    const excalidrawNodes = findExcalidrawNodes(editor);
                    const targetNode = excalidrawNodes.find(node => node.pos === position);

                    if (!targetNode) {
                        return {
                            success: false,
                            error: `No excalidraw diagram found at position ${position}. Use listExcalidrawDiagrams to find available diagrams.`,
                            availablePositions: excalidrawNodes.map(n => n.pos)
                        };
                    }

                    // Delete the node
                    editor.chain()
                        .focus()
                        .deleteRange({ from: position, to: position + targetNode.nodeSize })
                        .run();

                    return {
                        success: true,
                        message: 'Excalidraw diagram deleted successfully',
                        deletedPosition: position,
                        deletedElementCount: targetNode.elements.length
                    };
                } catch (error) {
                    return {
                        success: false,
                        error: `Failed to delete excalidraw diagram: ${error instanceof Error ? error.message : String(error)}`
                    };
                }
            }
        },

        // Tool 5: Get Excalidraw Templates
        {
            name: 'getExcalidrawTemplates',
            description: `获取 Excalidraw 图表模板信息和元素格式指南。用于了解支持的模板类型和如何构建自定义元素。

元素格式说明：
- rectangle: { type: "rectangle", x, y, width, height, backgroundColor?, strokeColor? }
- ellipse: { type: "ellipse", x, y, width, height, backgroundColor?, strokeColor? }
- diamond: { type: "diamond", x, y, width, height, backgroundColor?, strokeColor? }
- text: { type: "text", x, y, text, fontSize?, fontFamily? }
- arrow: { type: "arrow", x, y, width, height, points: [[x1,y1], [x2,y2], ...] }

常用颜色：#a5d8ff(蓝), #b2f2bb(绿), #ffec99(黄), #ffc9c9(红), #d0bfff(紫)`,
            inputSchema: z.object({
                templateType: z.enum(['flowchart', 'architecture', 'mindmap', 'sequence', 'shapes', 'all'] as const)
                    .describe("要获取的模板类型，'all' 返回所有模板信息").optional()
            }),
            execute: (_editor: Editor) => async (params: { templateType?: string }) => {
                const { templateType = 'all' } = params;

                if (templateType === 'all') {
                    const templates: Record<string, { description: string; elementCount: number }> = {};
                    for (const [key, value] of Object.entries(EXCALIDRAW_TEMPLATES)) {
                        const built = value.build();
                        templates[key] = {
                            description: value.description,
                            elementCount: built.length
                        };
                    }
                    return {
                        success: true,
                        templates,
                        availableTypes: TEMPLATE_TYPES,
                        elementGuide: {
                            supportedTypes: ['rectangle', 'ellipse', 'diamond', 'text', 'arrow', 'line', 'freedraw'],
                            commonColors: {
                                blue: '#a5d8ff',
                                green: '#b2f2bb',
                                yellow: '#ffec99',
                                red: '#ffc9c9',
                                purple: '#d0bfff'
                            },
                            tips: [
                                "All coordinates are in pixels, origin is top-left",
                                "Use backgroundColor for filled shapes",
                                "Arrow points are relative to x,y after normalization",
                                "Text fontSize default is 20, fontFamily: 1=hand-drawn, 2=normal, 3=monospace"
                            ]
                        },
                        message: 'All excalidraw templates retrieved successfully'
                    };
                }

                const template = EXCALIDRAW_TEMPLATES[templateType];
                if (!template) {
                    return {
                        success: false,
                        error: `Unknown template type: ${templateType}`,
                        availableTypes: TEMPLATE_TYPES
                    };
                }

                const built = template.build();
                return {
                    success: true,
                    templateType,
                    description: template.description,
                    elementCount: built.length,
                    sampleElements: built.slice(0, 3).map((el: any) => ({
                        type: el.type,
                        x: el.x,
                        y: el.y,
                        width: el.width,
                        height: el.height
                    })),
                    message: `Template for ${templateType} retrieved successfully`
                };
            }
        }
    ]
}
