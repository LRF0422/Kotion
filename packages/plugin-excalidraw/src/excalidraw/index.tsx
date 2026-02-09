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
// Graph layout: constants, types, and utilities
// ============================================================
const COLOR_MAP: Record<string, string> = {
    blue: '#a5d8ff', green: '#b2f2bb', yellow: '#ffec99',
    red: '#ffc9c9', purple: '#d0bfff', orange: '#ffd8a8',
    pink: '#fcc2d7', gray: '#dee2e6', cyan: '#99e9f2', lime: '#d8f5a2'
};
const resolveColor = (color?: string) => !color ? 'transparent' : COLOR_MAP[color.toLowerCase()] || color;

const NODE_DEFAULTS: Record<string, { width: number; height: number }> = {
    rectangle: { width: 160, height: 60 },
    ellipse: { width: 160, height: 80 },
    diamond: { width: 140, height: 100 }
};
const LAYOUT_SPACING = { horizontal: 100, vertical: 120 };
const TITLE_OFFSET_Y = 40;

interface GraphNode { id: string; label: string; type?: 'rectangle' | 'ellipse' | 'diamond'; color?: string }
interface GraphEdge { from: string; to: string; label?: string }

interface LayoutNode {
    id: string; label: string; type: 'rectangle' | 'ellipse' | 'diamond';
    color: string; x: number; y: number; width: number; height: number;
}
interface LayoutEdge {
    from: string; to: string; label?: string;
    startX: number; startY: number; endX: number; endY: number;
}
interface LayoutResult {
    nodes: LayoutNode[]; edges: LayoutEdge[];
    totalWidth: number; totalHeight: number;
}

// ============================================================
// Graph layout algorithm (Kahn's topological sort + BFS layering)
// ============================================================
const computeGraphLayout = (
    nodes: GraphNode[],
    edges: GraphEdge[],
    direction: 'vertical' | 'horizontal' = 'vertical'
): LayoutResult => {
    const nodeMap = new Map<string, GraphNode>();
    nodes.forEach(n => nodeMap.set(n.id, n));

    // Build adjacency and in-degree
    const adj = new Map<string, string[]>();
    const inDegree = new Map<string, number>();
    nodes.forEach(n => { adj.set(n.id, []); inDegree.set(n.id, 0); });

    const validEdges = edges.filter(e => e.from !== e.to && nodeMap.has(e.from) && nodeMap.has(e.to));
    validEdges.forEach(e => {
        adj.get(e.from)!.push(e.to);
        inDegree.set(e.to, (inDegree.get(e.to) || 0) + 1);
    });

    // BFS layering
    const layers: string[][] = [];
    const assigned = new Set<string>();
    let queue = nodes.filter(n => inDegree.get(n.id) === 0).map(n => n.id);

    while (assigned.size < nodes.length) {
        if (queue.length === 0) {
            // Handle cycles: pick first unassigned node
            const unassigned = nodes.find(n => !assigned.has(n.id));
            if (unassigned) queue = [unassigned.id];
            else break;
        }
        const layer: string[] = [];
        const nextQueue: string[] = [];
        for (const id of queue) {
            if (assigned.has(id)) continue;
            assigned.add(id);
            layer.push(id);
        }
        if (layer.length === 0) break;
        layers.push(layer);

        // Reduce in-degree for next layer
        for (const id of layer) {
            for (const neighbor of (adj.get(id) || [])) {
                if (assigned.has(neighbor)) continue;
                const newDeg = (inDegree.get(neighbor) || 1) - 1;
                inDegree.set(neighbor, newDeg);
                if (newDeg <= 0) nextQueue.push(neighbor);
            }
        }
        queue = nextQueue;
    }

    // Compute node sizes (adaptive width)
    const nodeSizes = new Map<string, { width: number; height: number }>();
    nodes.forEach(n => {
        const type = n.type || 'rectangle';
        const defaults = NODE_DEFAULTS[type] || NODE_DEFAULTS.rectangle;
        const labelWidth = n.label.length * 10 + 40;
        nodeSizes.set(n.id, {
            width: Math.max(defaults.width, labelWidth),
            height: defaults.height
        });
    });

    // Compute positions based on direction
    const isVertical = direction === 'vertical';
    const layoutNodes: LayoutNode[] = [];
    const nodePositions = new Map<string, { x: number; y: number; width: number; height: number }>();

    let mainOffset = 0; // offset along main axis (y for vertical, x for horizontal)

    for (const layer of layers) {
        // Compute layer cross-axis total size for centering
        let crossTotal = 0;
        const sizes = layer.map(id => nodeSizes.get(id)!);
        sizes.forEach((s, i) => {
            crossTotal += isVertical ? s.width : s.height;
            if (i < sizes.length - 1) crossTotal += LAYOUT_SPACING[isVertical ? 'horizontal' : 'vertical'];
        });

        let crossOffset = -crossTotal / 2; // center around 0

        // Max main-axis size in this layer (for spacing to next layer)
        let maxMain = 0;

        for (let i = 0; i < layer.length; i++) {
            const id = layer[i];
            const size = sizes[i];
            const node = nodeMap.get(id)!;

            let x: number, y: number;
            if (isVertical) {
                x = crossOffset;
                y = mainOffset;
                maxMain = Math.max(maxMain, size.height);
            } else {
                x = mainOffset;
                y = crossOffset;
                maxMain = Math.max(maxMain, size.width);
            }

            nodePositions.set(id, { x, y, width: size.width, height: size.height });
            layoutNodes.push({
                id, label: node.label,
                type: (node.type || 'rectangle') as 'rectangle' | 'ellipse' | 'diamond',
                color: resolveColor(node.color),
                x, y, width: size.width, height: size.height
            });

            crossOffset += (isVertical ? size.width : size.height) + LAYOUT_SPACING[isVertical ? 'horizontal' : 'vertical'];
        }

        mainOffset += maxMain + LAYOUT_SPACING[isVertical ? 'vertical' : 'horizontal'];
    }

    // Normalize positions so minimum x,y is at a comfortable offset
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    layoutNodes.forEach(n => {
        minX = Math.min(minX, n.x);
        minY = Math.min(minY, n.y);
        maxX = Math.max(maxX, n.x + n.width);
        maxY = Math.max(maxY, n.y + n.height);
    });
    const padX = 50 - minX;
    const padY = 50 + TITLE_OFFSET_Y - minY; // leave room for title
    layoutNodes.forEach(n => { n.x += padX; n.y += padY; });
    // Update nodePositions too
    nodePositions.forEach((pos, id) => { pos.x += padX; pos.y += padY; });

    // Compute edges with arrow start/end points
    const layoutEdges: LayoutEdge[] = validEdges.map(e => {
        const fromPos = nodePositions.get(e.from)!;
        const toPos = nodePositions.get(e.to)!;
        let startX: number, startY: number, endX: number, endY: number;

        if (isVertical) {
            // From bottom-center to top-center
            startX = fromPos.x + fromPos.width / 2;
            startY = fromPos.y + fromPos.height;
            endX = toPos.x + toPos.width / 2;
            endY = toPos.y;
        } else {
            // From right-center to left-center
            startX = fromPos.x + fromPos.width;
            startY = fromPos.y + fromPos.height / 2;
            endX = toPos.x;
            endY = toPos.y + toPos.height / 2;
        }

        return { from: e.from, to: e.to, label: e.label, startX, startY, endX, endY };
    });

    const totalWidth = (maxX + padX) - (minX + padX) + 100;
    const totalHeight = (maxY + padY) - (minY + padY) + 100;

    return { nodes: layoutNodes, edges: layoutEdges, totalWidth, totalHeight };
};

// ============================================================
// Build Excalidraw elements from layout result
// ============================================================
const buildExcalidrawElements = (
    layout: LayoutResult,
    title?: string
): any[] => {
    const elements: any[] = [];

    // Title text
    if (title) {
        const totalWidth = layout.totalWidth;
        const titleWidth = title.length * 12 + 20;
        const titleX = 50 + (totalWidth - titleWidth) / 2;
        elements.push(createText(titleX, 20, title, { fontSize: 24 }));
    }

    // Create shapes + bound text
    for (const node of layout.nodes) {
        const shapeId = generateId();
        const textId = generateId();
        const shapeOverrides = {
            id: shapeId,
            backgroundColor: node.color,
            boundElements: [{ id: textId, type: 'text' }]
        };

        let shape: any;
        switch (node.type) {
            case 'ellipse':
                shape = createEllipse(node.x, node.y, node.width, node.height, shapeOverrides);
                break;
            case 'diamond':
                shape = createDiamond(node.x, node.y, node.width, node.height, shapeOverrides);
                break;
            default:
                shape = createRectangle(node.x, node.y, node.width, node.height, {
                    ...shapeOverrides, roundness: { type: 3 }
                });
        }
        elements.push(shape);

        // Bound text (centered inside shape)
        const textWidth = node.label.length * 10;
        const textX = node.x + (node.width - textWidth) / 2;
        const textY = node.y + (node.height - 25) / 2;
        elements.push(createText(textX, textY, node.label, {
            id: textId,
            containerId: shapeId,
            width: textWidth,
            height: 25
        }));
    }

    // Create arrows + labels
    for (const edge of layout.edges) {
        elements.push(createArrow(
            [[edge.startX, edge.startY], [edge.endX, edge.endY]]
        ));

        if (edge.label) {
            const midX = (edge.startX + edge.endX) / 2;
            const midY = (edge.startY + edge.endY) / 2 - 18;
            elements.push(createText(midX, midY, edge.label, { fontSize: 14 }));
        }
    }

    return elements;
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
        },

        // Tool 6: Create Excalidraw from Graph Description
        {
            name: 'createExcalidrawFromGraph',
            description: `从逻辑图描述（节点+边）自动创建布局合理的 Excalidraw 图表。
AI 只需描述图的逻辑结构，工具自动计算所有坐标和布局。

**优先使用此工具**而非手动指定坐标的 insertExcalidrawDiagram。

节点类型：rectangle（流程步骤）、ellipse（起止/数据）、diamond（判断/条件）
颜色名：blue, green, yellow, red, purple, orange, pink, gray, cyan, lime，或直接用 hex
布局方向：vertical（层级/流程图）、horizontal（时间线/管道）`,
            inputSchema: z.object({
                title: z.string().describe("图表标题（可选）").optional(),
                nodes: z.array(z.object({
                    id: z.string().describe("节点唯一标识"),
                    label: z.string().describe("节点显示文字"),
                    type: z.enum(['rectangle', 'ellipse', 'diamond']).describe("形状类型").optional(),
                    color: z.string().describe("背景色名称或 hex 值").optional()
                })).describe("图中的节点列表"),
                edges: z.array(z.object({
                    from: z.string().describe("起始节点 id"),
                    to: z.string().describe("目标节点 id"),
                    label: z.string().describe("连线标签").optional()
                })).describe("节点之间的连线"),
                layout: z.enum(['vertical', 'horizontal']).describe("布局方向，默认 vertical").optional(),
                position: z.number().describe("插入位置（可选）").optional()
            }),
            execute: (editor: Editor) => async (params: {
                title?: string;
                nodes: GraphNode[];
                edges: GraphEdge[];
                layout?: 'vertical' | 'horizontal';
                position?: number;
            }) => {
                try {
                    const { title, nodes, edges, layout = 'vertical', position } = params;

                    // Validate
                    if (!nodes || nodes.length === 0) {
                        return { success: false, error: 'nodes 数组不能为空' };
                    }
                    const nodeIds = new Set(nodes.map(n => n.id));
                    const invalidEdges = edges.filter(e => !nodeIds.has(e.from) || !nodeIds.has(e.to));
                    if (invalidEdges.length > 0) {
                        return {
                            success: false,
                            error: `以下边引用了不存在的节点: ${invalidEdges.map(e => `${e.from}->${e.to}`).join(', ')}`,
                            availableNodeIds: [...nodeIds]
                        };
                    }

                    // Compute layout and build elements
                    const layoutResult = computeGraphLayout(nodes, edges, layout);
                    const elements = buildExcalidrawElements(layoutResult, title);

                    // Insert into document
                    if (position !== undefined) {
                        const docSize = editor.state.doc.nodeSize;
                        if (position < 0 || position > docSize - 2) {
                            return { success: false, error: `Invalid position: ${position}. Document size is ${docSize}` };
                        }
                        editor.chain().focus().insertContentAt(position, {
                            type: 'excalidraw',
                            attrs: { elements, appState: { isLoading: false } }
                        }).run();
                    } else {
                        editor.commands.insertExcalidraw(elements);
                    }

                    return {
                        success: true,
                        message: `图表创建成功：${nodes.length} 个节点，${edges.length} 条边，方向=${layout}`,
                        nodeCount: nodes.length,
                        edgeCount: edges.length,
                        elementCount: elements.length,
                        layout
                    };
                } catch (error) {
                    return {
                        success: false,
                        error: `Failed to create graph diagram: ${error instanceof Error ? error.message : String(error)}`
                    };
                }
            }
        }
    ],

    skills: [{
        name: 'excalidraw-drawing',
        description: 'Excalidraw 绘图技能：将用户需求转化为结构化图表',
        requiredTools: ['createExcalidrawFromGraph', 'insertExcalidrawDiagram',
                        'listExcalidrawDiagrams', 'updateExcalidrawDiagram',
                        'deleteExcalidrawDiagram', 'getExcalidrawTemplates'],
        tags: ['excalidraw', 'drawing', 'diagram', 'graph', 'flowchart'],
        systemPromptFragment: `# Excalidraw 绘图技能

## 工具选择优先级
1. **createExcalidrawFromGraph** — 首选！只需描述节点和边，自动布局
2. **insertExcalidrawDiagram + templateType** — 用于标准模板（flowchart/architecture/mindmap/sequence）
3. **insertExcalidrawDiagram + elements** — 最后手段，需要手动坐标

## 思维方式
用户请求 → 识别实体为节点 → 识别关系为边 → 选择形状/颜色/方向 → 调用 createExcalidrawFromGraph

## 形状语义
- **rectangle** — 流程步骤、服务、模块、普通节点（默认）
- **ellipse** — 起点/终点、数据存储、外部系统
- **diamond** — 判断条件、决策点、分支

## 颜色语义
- **blue** — 入口、起点、用户操作
- **green** — 成功、完成、正常路径
- **yellow** — 数据、警告、中间状态
- **red** — 错误、失败、异常路径
- **purple** — 外部系统、第三方服务
- **orange** — 处理中、队列、缓冲
- **gray** — 可选、禁用、次要

## 方向选择
- **vertical**（默认）— 层级结构、流程图、决策树
- **horizontal** — 时间线、管道、数据流

## 示例 1：用户登录流程
\`\`\`json
{
  "title": "用户登录流程",
  "nodes": [
    { "id": "start", "label": "用户访问", "type": "ellipse", "color": "blue" },
    { "id": "input", "label": "输入账号密码", "color": "blue" },
    { "id": "validate", "label": "验证凭证", "type": "diamond", "color": "yellow" },
    { "id": "success", "label": "登录成功", "color": "green" },
    { "id": "fail", "label": "登录失败", "color": "red" },
    { "id": "retry", "label": "重试/找回密码", "color": "orange" }
  ],
  "edges": [
    { "from": "start", "to": "input" },
    { "from": "input", "to": "validate" },
    { "from": "validate", "to": "success", "label": "通过" },
    { "from": "validate", "to": "fail", "label": "失败" },
    { "from": "fail", "to": "retry" },
    { "from": "retry", "to": "input" }
  ],
  "layout": "vertical"
}
\`\`\`

## 示例 2：微服务架构
\`\`\`json
{
  "title": "微服务架构",
  "nodes": [
    { "id": "client", "label": "Web Client", "type": "ellipse", "color": "blue" },
    { "id": "gateway", "label": "API Gateway", "color": "purple" },
    { "id": "auth", "label": "Auth Service", "color": "green" },
    { "id": "user", "label": "User Service", "color": "green" },
    { "id": "order", "label": "Order Service", "color": "green" },
    { "id": "db", "label": "Database", "type": "ellipse", "color": "yellow" },
    { "id": "cache", "label": "Redis Cache", "type": "ellipse", "color": "orange" }
  ],
  "edges": [
    { "from": "client", "to": "gateway", "label": "HTTPS" },
    { "from": "gateway", "to": "auth", "label": "JWT" },
    { "from": "gateway", "to": "user" },
    { "from": "gateway", "to": "order" },
    { "from": "user", "to": "db" },
    { "from": "order", "to": "db" },
    { "from": "auth", "to": "cache" }
  ],
  "layout": "vertical"
}
\`\`\`

## 注意事项
- 节点 id 用英文小写，简短有意义
- label 用中文或英文均可，保持简洁（建议 2-8 个字）
- 边的 label 只在需要说明关系类型时添加
- 不要超过 15 个节点，太多会影响可读性
- 更新已有图表时，先用 listExcalidrawDiagrams 获取位置`
    }]
}
