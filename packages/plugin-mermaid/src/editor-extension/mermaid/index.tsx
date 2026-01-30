import { ExtensionWrapper } from "@kn/common";
import { Mermaid } from "./mermaid";
import { ChartPieIcon } from "@kn/icon";
import React from "react";
import { z } from "@kn/ui";
import type { Editor } from "@kn/editor";

/**
 * Mermaid chart type templates for Agent reference
 */
const MERMAID_TEMPLATES = {
    flowchart: `flowchart TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Result 1]
    B -->|No| D[Result 2]
    C --> E[End]
    D --> E`,
    sequence: `sequenceDiagram
    participant A as User
    participant B as System
    A->>B: Request
    B-->>A: Response`,
    classDiagram: `classDiagram
    class Animal {
        +String name
        +int age
        +makeSound()
    }
    class Dog {
        +bark()
    }
    Animal <|-- Dog`,
    stateDiagram: `stateDiagram-v2
    [*] --> Idle
    Idle --> Processing: start
    Processing --> Completed: success
    Processing --> Failed: error
    Completed --> [*]
    Failed --> Idle: retry`,
    erDiagram: `erDiagram
    USER ||--o{ ORDER : places
    ORDER ||--|{ ITEM : contains
    USER {
        int id PK
        string name
        string email
    }
    ORDER {
        int id PK
        date created
    }`,
    gantt: `gantt
    title Project Timeline
    dateFormat YYYY-MM-DD
    section Phase 1
    Task 1: 2024-01-01, 7d
    Task 2: 2024-01-08, 5d
    section Phase 2
    Task 3: 2024-01-13, 10d`,
    pie: `pie title Distribution
    "Category A" : 40
    "Category B" : 30
    "Category C" : 20
    "Category D" : 10`,
    mindmap: `mindmap
    root((Main Topic))
        Branch 1
            Sub-topic 1.1
            Sub-topic 1.2
        Branch 2
            Sub-topic 2.1
        Branch 3`,
    timeline: `timeline
    title History
    2020 : Event 1
    2021 : Event 2
    2022 : Event 3
    2023 : Event 4`,
    gitGraph: `gitGraph
    commit
    branch develop
    checkout develop
    commit
    commit
    checkout main
    merge develop
    commit`
};

/**
 * Helper function to find all mermaid nodes in the document
 */
const findMermaidNodes = (editor: Editor) => {
    const nodes: Array<{ pos: number; code: string; nodeSize: number }> = [];
    editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'mermaid') {
            nodes.push({
                pos,
                code: node.attrs.data || '',
                nodeSize: node.nodeSize
            });
        }
    });
    return nodes;
};

export const MermaidExtension: ExtensionWrapper = {
    name: Mermaid.name,
    extendsion: [Mermaid],
    slashConfig: [
        {
            text: 'mermaid',
            slash: '/mermaid',
            icon: <ChartPieIcon className="h-4 w-4" />,
            action: (editor) => {
                editor.commands.insertMermaid()
            }
        }
    ],
    tools: [
        // Tool 1: Insert Mermaid Diagram
        {
            name: 'insertMermaidDiagram',
            description: `插入 Mermaid 图表。支持多种图表类型：
- flowchart: 流程图，用于展示流程、决策树
- sequence: 时序图，用于展示系统交互、API调用流程
- classDiagram: 类图，用于展示代码结构、类关系
- stateDiagram: 状态图，用于展示状态转换
- erDiagram: ER图，用于展示数据库关系
- gantt: 甘特图，用于项目时间规划
- pie: 饼图，用于展示数据分布比例
- mindmap: 思维导图，用于展示层级结构
- timeline: 时间线，用于展示历史事件
- gitGraph: Git分支图，用于展示版本控制流程

如果用户没有指定具体代码，可以根据chartType生成模板；如果用户提供了具体需求，应根据需求生成对应的Mermaid代码。`,
            inputSchema: z.object({
                code: z.string().describe("Mermaid 图表代码。如果不提供，将根据 chartType 使用默认模板").optional(),
                chartType: z.enum([
                    'flowchart', 'sequence', 'classDiagram', 'stateDiagram',
                    'erDiagram', 'gantt', 'pie', 'mindmap', 'timeline', 'gitGraph'
                ]).describe("图表类型。用于生成模板或验证代码格式").optional(),
                position: z.number().describe("插入位置。如不指定则插入到当前光标位置或文档末尾").optional()
            }),
            execute: (editor: Editor) => async (params: {
                code?: string;
                chartType?: keyof typeof MERMAID_TEMPLATES;
                position?: number;
            }) => {
                try {
                    const { code, chartType, position } = params;

                    // Determine the mermaid code to use
                    let mermaidCode = code;
                    if (!mermaidCode && chartType) {
                        mermaidCode = MERMAID_TEMPLATES[chartType];
                    }
                    if (!mermaidCode) {
                        mermaidCode = MERMAID_TEMPLATES.flowchart; // Default to flowchart
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
                                type: 'mermaid',
                                attrs: { data: mermaidCode }
                            })
                            .run();
                    } else {
                        editor.commands.insertMermaid(mermaidCode);
                    }

                    return {
                        success: true,
                        message: `Mermaid diagram inserted successfully`,
                        chartType: chartType || 'custom',
                        codePreview: mermaidCode.substring(0, 100) + (mermaidCode.length > 100 ? '...' : '')
                    };
                } catch (error) {
                    return {
                        success: false,
                        error: `Failed to insert mermaid diagram: ${error instanceof Error ? error.message : String(error)}`
                    };
                }
            }
        },

        // Tool 2: List All Mermaid Diagrams
        {
            name: 'listMermaidDiagrams',
            description: '列出文档中所有的 Mermaid 图表，返回每个图表的位置、代码预览和图表类型。用于在更新或删除图表前了解文档中已有的图表。',
            inputSchema: z.object({}),
            execute: (editor: Editor) => async () => {
                try {
                    const mermaidNodes = findMermaidNodes(editor);

                    if (mermaidNodes.length === 0) {
                        return {
                            success: true,
                            count: 0,
                            diagrams: [],
                            message: 'No mermaid diagrams found in the document'
                        };
                    }

                    const diagrams = mermaidNodes.map((node, index) => {
                        // Detect chart type from code
                        let detectedType = 'unknown';
                        const codeLower = node.code.toLowerCase().trim();
                        if (codeLower.startsWith('flowchart') || codeLower.startsWith('graph')) {
                            detectedType = 'flowchart';
                        } else if (codeLower.startsWith('sequencediagram')) {
                            detectedType = 'sequence';
                        } else if (codeLower.startsWith('classdiagram')) {
                            detectedType = 'classDiagram';
                        } else if (codeLower.startsWith('statediagram')) {
                            detectedType = 'stateDiagram';
                        } else if (codeLower.startsWith('erdiagram')) {
                            detectedType = 'erDiagram';
                        } else if (codeLower.startsWith('gantt')) {
                            detectedType = 'gantt';
                        } else if (codeLower.startsWith('pie')) {
                            detectedType = 'pie';
                        } else if (codeLower.startsWith('mindmap')) {
                            detectedType = 'mindmap';
                        } else if (codeLower.startsWith('timeline')) {
                            detectedType = 'timeline';
                        } else if (codeLower.startsWith('gitgraph')) {
                            detectedType = 'gitGraph';
                        }

                        return {
                            index,
                            position: node.pos,
                            nodeSize: node.nodeSize,
                            chartType: detectedType,
                            codePreview: node.code.substring(0, 150) + (node.code.length > 150 ? '...' : ''),
                            fullCode: node.code
                        };
                    });

                    return {
                        success: true,
                        count: diagrams.length,
                        diagrams,
                        message: `Found ${diagrams.length} mermaid diagram(s) in the document`
                    };
                } catch (error) {
                    return {
                        success: false,
                        error: `Failed to list mermaid diagrams: ${error instanceof Error ? error.message : String(error)}`
                    };
                }
            }
        },

        // Tool 3: Update Mermaid Diagram
        {
            name: 'updateMermaidDiagram',
            description: '更新文档中指定位置的 Mermaid 图表代码。需要先使用 listMermaidDiagrams 获取图表位置。',
            inputSchema: z.object({
                position: z.number().describe("要更新的 Mermaid 图表的位置（通过 listMermaidDiagrams 获取）"),
                newCode: z.string().describe("新的 Mermaid 图表代码")
            }),
            execute: (editor: Editor) => async (params: { position: number; newCode: string }) => {
                try {
                    const { position, newCode } = params;

                    // Find the mermaid node at the specified position
                    const mermaidNodes = findMermaidNodes(editor);
                    const targetNode = mermaidNodes.find(node => node.pos === position);

                    if (!targetNode) {
                        return {
                            success: false,
                            error: `No mermaid diagram found at position ${position}. Use listMermaidDiagrams to find available diagrams.`,
                            availablePositions: mermaidNodes.map(n => n.pos)
                        };
                    }

                    // Update the node by replacing it
                    const tr = editor.state.tr;
                    const node = editor.state.doc.nodeAt(position);

                    if (!node || node.type.name !== 'mermaid') {
                        return {
                            success: false,
                            error: `Invalid node at position ${position}`
                        };
                    }

                    // Create new node with updated attributes
                    const newNode = node.type.create({ ...node.attrs, data: newCode });
                    tr.replaceWith(position, position + node.nodeSize, newNode);
                    editor.view.dispatch(tr);

                    return {
                        success: true,
                        message: 'Mermaid diagram updated successfully',
                        position,
                        oldCodePreview: targetNode.code.substring(0, 100) + (targetNode.code.length > 100 ? '...' : ''),
                        newCodePreview: newCode.substring(0, 100) + (newCode.length > 100 ? '...' : '')
                    };
                } catch (error) {
                    return {
                        success: false,
                        error: `Failed to update mermaid diagram: ${error instanceof Error ? error.message : String(error)}`
                    };
                }
            }
        },

        // Tool 4: Delete Mermaid Diagram
        {
            name: 'deleteMermaidDiagram',
            description: '删除文档中指定位置的 Mermaid 图表。需要先使用 listMermaidDiagrams 获取图表位置。',
            inputSchema: z.object({
                position: z.number().describe("要删除的 Mermaid 图表的位置（通过 listMermaidDiagrams 获取）")
            }),
            execute: (editor: Editor) => async (params: { position: number }) => {
                try {
                    const { position } = params;

                    // Find the mermaid node at the specified position
                    const mermaidNodes = findMermaidNodes(editor);
                    const targetNode = mermaidNodes.find(node => node.pos === position);

                    if (!targetNode) {
                        return {
                            success: false,
                            error: `No mermaid diagram found at position ${position}. Use listMermaidDiagrams to find available diagrams.`,
                            availablePositions: mermaidNodes.map(n => n.pos)
                        };
                    }

                    // Delete the node
                    editor.chain()
                        .focus()
                        .deleteRange({ from: position, to: position + targetNode.nodeSize })
                        .run();

                    return {
                        success: true,
                        message: 'Mermaid diagram deleted successfully',
                        deletedPosition: position,
                        deletedCodePreview: targetNode.code.substring(0, 100) + (targetNode.code.length > 100 ? '...' : '')
                    };
                } catch (error) {
                    return {
                        success: false,
                        error: `Failed to delete mermaid diagram: ${error instanceof Error ? error.message : String(error)}`
                    };
                }
            }
        },

        // Tool 5: Get Mermaid Templates
        {
            name: 'getMermaidTemplates',
            description: '获取所有可用的 Mermaid 图表类型模板。用于了解支持的图表类型和语法示例。',
            inputSchema: z.object({
                chartType: z.enum([
                    'flowchart', 'sequence', 'classDiagram', 'stateDiagram',
                    'erDiagram', 'gantt', 'pie', 'mindmap', 'timeline', 'gitGraph', 'all'
                ]).describe("要获取的图表类型模板，'all' 返回所有模板").optional()
            }),
            execute: (_editor: Editor) => async (params: { chartType?: keyof typeof MERMAID_TEMPLATES | 'all' }) => {
                const { chartType = 'all' } = params;

                if (chartType === 'all') {
                    return {
                        success: true,
                        templates: MERMAID_TEMPLATES,
                        availableTypes: Object.keys(MERMAID_TEMPLATES),
                        message: 'All mermaid templates retrieved successfully'
                    };
                }

                const template = MERMAID_TEMPLATES[chartType as keyof typeof MERMAID_TEMPLATES];
                if (!template) {
                    return {
                        success: false,
                        error: `Unknown chart type: ${chartType}`,
                        availableTypes: Object.keys(MERMAID_TEMPLATES)
                    };
                }

                return {
                    success: true,
                    chartType,
                    template,
                    message: `Template for ${chartType} retrieved successfully`
                };
            }
        }
    ]
}