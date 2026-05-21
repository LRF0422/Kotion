import { ExtensionWrapper, resolveBlockInsertPosition } from "@kn/common";
import { Chart } from "./chart";
import { BarChart3 } from "@kn/icon";
import React from "react";
import { z } from "@kn/ui";
import type { Editor } from "@kn/editor";
import type { ChartData, SeriesConfig } from "./chart";
import { chartSkill } from "./skills/chart-skill";
import { COLOR_PALETTES } from "./chart-colors";

/**
 * Chart templates with sample data for Agent reference
 */
const CHART_TEMPLATES: Record<string, ChartData> = {
    bar: {
        type: "bar",
        title: "Monthly Revenue",
        data: [
            { month: "Jan", revenue: 4500, cost: 2800 },
            { month: "Feb", revenue: 5200, cost: 3100 },
            { month: "Mar", revenue: 6100, cost: 3500 },
            { month: "Apr", revenue: 5800, cost: 3200 },
            { month: "May", revenue: 7200, cost: 3800 },
            { month: "Jun", revenue: 8100, cost: 4200 },
        ],
        dataKeys: ["revenue", "cost"],
        categoryKey: "month",
        colorScheme: "default",
        showLegend: true,
        showGrid: true,
        height: 300,
    },
    line: {
        type: "line",
        title: "User Growth",
        data: [
            { month: "Jan", users: 1200, activeUsers: 800 },
            { month: "Feb", users: 1500, activeUsers: 1050 },
            { month: "Mar", users: 2100, activeUsers: 1500 },
            { month: "Apr", users: 2800, activeUsers: 2000 },
            { month: "May", users: 3500, activeUsers: 2600 },
            { month: "Jun", users: 4200, activeUsers: 3100 },
        ],
        dataKeys: ["users", "activeUsers"],
        categoryKey: "month",
        colorScheme: "default",
        showLegend: true,
        showGrid: true,
        smoothLine: true,
        height: 300,
    },
    area: {
        type: "area",
        title: "Website Traffic",
        data: [
            { month: "Jan", desktop: 3200, mobile: 2100 },
            { month: "Feb", desktop: 3800, mobile: 2600 },
            { month: "Mar", desktop: 4200, mobile: 3100 },
            { month: "Apr", desktop: 3900, mobile: 3400 },
            { month: "May", desktop: 4800, mobile: 3900 },
            { month: "Jun", desktop: 5100, mobile: 4200 },
        ],
        dataKeys: ["desktop", "mobile"],
        categoryKey: "month",
        colorScheme: "ocean",
        showLegend: true,
        showGrid: true,
        smoothLine: true,
        height: 300,
    },
    pie: {
        type: "pie",
        title: "Market Share",
        data: [
            { name: "Chrome", value: 65 },
            { name: "Safari", value: 19 },
            { name: "Firefox", value: 8 },
            { name: "Edge", value: 5 },
            { name: "Other", value: 3 },
        ],
        dataKeys: ["value"],
        categoryKey: "name",
        colorScheme: "default",
        showLegend: true,
        height: 300,
    },
    radar: {
        type: "radar",
        title: "Skills Assessment",
        data: [
            { skill: "Speed", developer: 85, team: 70 },
            { skill: "Quality", developer: 90, team: 75 },
            { skill: "Communication", developer: 65, team: 80 },
            { skill: "Creativity", developer: 80, team: 60 },
            { skill: "Reliability", developer: 88, team: 82 },
            { skill: "Leadership", developer: 60, team: 72 },
        ],
        dataKeys: ["developer", "team"],
        categoryKey: "skill",
        colorScheme: "default",
        showLegend: true,
        showGrid: true,
        height: 350,
    },
    radialBar: {
        type: "radialBar",
        title: "Project Completion",
        data: [
            { name: "Frontend", progress: 85 },
            { name: "Backend", progress: 72 },
            { name: "Design", progress: 95 },
            { name: "Testing", progress: 60 },
        ],
        dataKeys: ["progress"],
        categoryKey: "name",
        colorScheme: "default",
        showLegend: true,
        height: 300,
    },
    scatter: {
        type: "scatter",
        title: "Height vs Weight",
        data: [
            { height: 160, weight: 55 },
            { height: 165, weight: 60 },
            { height: 170, weight: 68 },
            { height: 175, weight: 72 },
            { height: 180, weight: 78 },
            { height: 168, weight: 63 },
            { height: 172, weight: 70 },
            { height: 178, weight: 75 },
        ],
        dataKeys: ["height", "weight"],
        colorScheme: "default",
        showLegend: true,
        showGrid: true,
        height: 300,
    },
    compose: {
        type: "compose",
        title: "Revenue vs Growth Rate",
        data: [
            { month: "Jan", revenue: 4500, growthRate: 12 },
            { month: "Feb", revenue: 5200, growthRate: 15 },
            { month: "Mar", revenue: 6100, growthRate: 18 },
            { month: "Apr", revenue: 5800, growthRate: -5 },
            { month: "May", revenue: 7200, growthRate: 24 },
            { month: "Jun", revenue: 8100, growthRate: 13 },
        ],
        dataKeys: ["revenue", "growthRate"],
        categoryKey: "month",
        colorScheme: "default",
        seriesConfig: {
            revenue: { type: "bar", yAxisId: "left" },
            growthRate: { type: "line", yAxisId: "right" },
        },
        rightYAxis: true,
        showLegend: true,
        showGrid: true,
        smoothLine: true,
        height: 300,
    },
};

/**
 * Helper function to find all chart nodes in the document
 */
const findChartNodes = (editor: Editor) => {
    const nodes: Array<{ pos: number; data: ChartData | null; nodeSize: number }> = [];
    editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'chart') {
            let chartData: ChartData | null = null;
            try {
                chartData = node.attrs.data
                    ? (typeof node.attrs.data === 'string' ? JSON.parse(node.attrs.data) : node.attrs.data)
                    : null;
            } catch {
                chartData = null;
            }
            nodes.push({
                pos,
                data: chartData,
                nodeSize: node.nodeSize
            });
        }
    });
    return nodes;
};

export const ChartExtension: ExtensionWrapper = {
    name: Chart.name,
    extendsion: [Chart],
    slashConfig: [
        {
            text: 'chart',
            slash: '/chart',
            icon: <BarChart3 className="h-4 w-4" />,
            action: (editor) => {
                editor.commands.insertChart()
            }
        }
    ],
    tools: [
        // Tool 1: Insert Chart
        {
            name: 'insertChart',
            description: `插入数据可视化图表。支持多种图表类型：
- bar: 柱状图，用于比较不同类别的数值
- line: 折线图，用于展示趋势变化
- area: 面积图，用于展示趋势和累积量
- pie: 饼图，用于展示比例分布
- radar: 雷达图，用于多维度对比
- radialBar: 径向柱图，用于展示进度/完成度
- scatter: 散点图，用于展示两个变量的关系
- compose: 组合图表，在同一图表中混合柱状图、折线图、面积图，支持双 Y 轴

必须提供 chartConfig 参数，包含 type、data、dataKeys 等信息。

色彩方案（colorScheme）：请从预定义方案中选择，不要自行填写颜色值，以确保深浅模式适配：
- default: 默认方案（蓝、绿、琥珀、玫瑰、紫等）
- ocean: 海洋色系（蓝、青、靛等冷色调）
- warm: 暖色方案（橙、琥珀、玫瑰、粉等暖色调）
- pastel: 柔和方案（低饱和度的柔和色彩）
- vivid: 鲜艳方案（高饱和度的鲜艳色彩）
- earth: 大地色系（棕、绿、黄等自然色调）

插入位置定位（优先级从高到低）：
1. nearText + placement：在包含指定文本的块之前/之后插入（推荐，最精确）
2. blockIndex：在指定块索引之后插入
3. position：使用 ProseMirror 绝对位置，默认吸附到块边界`,
            inputSchema: z.object({
                chartConfig: z.object({
                    type: z.enum(['bar', 'line', 'area', 'pie', 'radar', 'radialBar', 'scatter', 'compose']).describe("图表类型"),
                    title: z.string().describe("图表标题").optional(),
                    description: z.string().describe("图表描述").optional(),
                    data: z.array(z.record(z.string(), z.any())).describe("数据数组，每个元素是一个数据点对象"),
                    dataKeys: z.array(z.string()).describe("数据系列键名数组（对应 y 轴值）"),
                    categoryKey: z.string().describe("分类键名（对应 x 轴/标签）").optional(),
                    colorScheme: z.enum(COLOR_PALETTES.map(p => p.key) as [string, ...string[]]).describe(`色彩方案，自动适配深浅模式。可选值：${COLOR_PALETTES.map(p => p.key).join('、')}。推荐使用此参数而非手动指定颜色值`).optional(),
                    showLegend: z.boolean().describe("是否显示图例").optional(),
                    showGrid: z.boolean().describe("是否显示网格线").optional(),
                    showDataLabels: z.boolean().describe("是否显示数据标签").optional(),
                    smoothLine: z.boolean().describe("折线/面积图是否使用平滑曲线").optional(),
                    stacked: z.boolean().describe("是否堆叠显示").optional(),
                    horizontal: z.boolean().describe("是否水平显示（仅柱状图）").optional(),
                    height: z.number().describe("图表高度（像素）").optional(),
                    innerRadius: z.number().describe("饼图内半径（用于环形图）").optional(),
                    seriesConfig: z.record(z.string(), z.object({
                        type: z.enum(['bar', 'line', 'area']).describe("该系列的图表类型"),
                        yAxisId: z.enum(['left', 'right']).describe("使用哪个 Y 轴").optional(),
                    })).describe("组合图表的系列配置，key 为 dataKey，value 为该系列的渲染配置").optional(),
                    rightYAxis: z.boolean().describe("是否显示右侧 Y 轴（用于组合图表双 Y 轴）").optional(),
                }).describe("图表配置对象，包含类型、数据、样式等"),
                nearText: z.string().describe("搜索文档中包含此文本的块，在该块附近插入图表（优先使用此参数定位，比 position 更精确）").optional(),
                placement: z.enum(['before', 'after']).describe("插入位置：'before' 在匹配块之前，'after' 在匹配块之后。默认 'after'。仅与 nearText 或 position 一起使用时有效").optional(),
                blockIndex: z.number().describe("在该块索引之后插入图表（从0开始）。可通过 getDocumentStructure 获取块索引").optional(),
                position: z.number().describe("插入位置（ProseMirror 绝对位置）。推荐使用 nearText 代替此参数以获得更精确的定位。注意：chart 为块级原子节点，若传入段落内部的字符位置或嵌套容器内的位置，会自动沿层级向上找到可容纳 chart 的最近父级，并吸附到该层级的边界").optional()
            }),
            execute: (editor: Editor) => async (params: {
                chartConfig: ChartData;
                nearText?: string;
                placement?: 'before' | 'after';
                blockIndex?: number;
                position?: number;
            }) => {
                try {
                    const { chartConfig, nearText, placement = 'after', blockIndex, position } = params;

                    // Validate required fields
                    if (!chartConfig.type) {
                        return { success: false, error: 'chartConfig.type is required' };
                    }
                    if (!chartConfig.data || !Array.isArray(chartConfig.data) || chartConfig.data.length === 0) {
                        return { success: false, error: 'chartConfig.data must be a non-empty array' };
                    }
                    if (!chartConfig.dataKeys || !Array.isArray(chartConfig.dataKeys) || chartConfig.dataKeys.length === 0) {
                        return { success: false, error: 'chartConfig.dataKeys must be a non-empty array of series key names' };
                    }

                    // Strip deprecated `colors` field — it breaks light/dark mode adaptation
                    // and can cause CSS variable resolution failures (resulting in black bars).
                    // The `colorScheme` field should be used instead.
                    const cleanConfig = { ...chartConfig };
                    delete (cleanConfig as any).colors;

                    const chartNode = {
                        type: 'chart' as const,
                        attrs: { data: JSON.stringify(cleanConfig) }
                    };

                    const resolved = resolveBlockInsertPosition(editor, 'chart', {
                        nearText, placement, blockIndex, position
                    });

                    if (resolved) {
                        if (resolved.pos === -1) {
                            if (resolved.strategy === 'nearText-not-found') {
                                return {
                                    success: false,
                                    error: `未找到包含 "${nearText}" 的块。请使用 getDocumentStructure 查看文档结构，或使用 blockIndex 定位。`
                                };
                            }
                            if (resolved.strategy === 'blockIndex-out-of-range') {
                                return {
                                    success: false,
                                    error: `blockIndex 越界，请使用 getDocumentStructure 查看文档结构。`
                                };
                            }
                            return {
                                success: false,
                                error: `插入位置超出文档范围。`
                            };
                        }

                        const success = editor.chain()
                            .focus()
                            .insertContentAt(resolved.pos, chartNode)
                            .run();

                        return success
                            ? {
                                success: true,
                                message: `Chart inserted via ${resolved.strategy}`,
                                chartType: chartConfig.type,
                                dataPoints: chartConfig.data.length,
                                series: chartConfig.dataKeys.length
                            }
                            : { success: false, error: 'Failed to insert chart at the specified position' };
                    }

                    // Default — insert after the current cursor block to avoid
                    // replacing existing content. Compute a safe block-boundary
                    // position from the editor selection.
                    const { from } = editor.state.selection;
                    const safePos = resolveBlockInsertPosition(editor, 'chart', {
                        position: from,
                        placement: 'after',
                    });

                    if (safePos && safePos.pos >= 0) {
                        editor.chain().focus().insertContentAt(safePos.pos, chartNode).run();
                    } else {
                        // Ultimate fallback: append at document end
                        const endPos = editor.state.doc.content.size;
                        editor.chain().focus().insertContentAt(endPos, chartNode).run();
                    }

                    return {
                        success: true,
                        message: `Chart inserted at cursor position`,
                        chartType: chartConfig.type,
                        dataPoints: chartConfig.data.length,
                        series: chartConfig.dataKeys.length
                    };
                } catch (error) {
                    return {
                        success: false,
                        error: `Failed to insert chart: ${error instanceof Error ? error.message : String(error)}`
                    };
                }
            }
        },

        // Tool 2: List All Charts
        {
            name: 'listCharts',
            description: '列出文档中所有的图表，返回每个图表的位置、类型、标题和数据预览。用于在更新或删除图表前了解文档中已有的图表。',
            inputSchema: z.object({}),
            execute: (editor: Editor) => async () => {
                try {
                    const chartNodes = findChartNodes(editor);

                    if (chartNodes.length === 0) {
                        return {
                            success: true,
                            count: 0,
                            charts: [],
                            message: 'No charts found in the document'
                        };
                    }

                    const charts = chartNodes.map((node, index) => ({
                        index,
                        position: node.pos,
                        nodeSize: node.nodeSize,
                        type: node.data?.type || 'unknown',
                        title: node.data?.title || 'Untitled',
                        dataPoints: node.data?.data?.length || 0,
                        dataKeys: node.data?.dataKeys || [],
                        categoryKey: node.data?.categoryKey,
                    }));

                    return {
                        success: true,
                        count: charts.length,
                        charts,
                        message: `Found ${charts.length} chart(s) in the document`
                    };
                } catch (error) {
                    return {
                        success: false,
                        error: `Failed to list charts: ${error instanceof Error ? error.message : String(error)}`
                    };
                }
            }
        },

        // Tool 3: Update Chart
        {
            name: 'updateChart',
            description: '更新文档中指定位置的图表配置。需要先使用 listCharts 获取图表位置。可以更新图表类型、数据、样式等。',
            inputSchema: z.object({
                position: z.number().describe("要更新的图表的位置（通过 listCharts 获取）"),
                chartConfig: z.object({
                    type: z.enum(['bar', 'line', 'area', 'pie', 'radar', 'radialBar', 'scatter', 'compose']).describe("图表类型").optional(),
                    title: z.string().describe("图表标题").optional(),
                    description: z.string().describe("图表描述").optional(),
                    data: z.array(z.record(z.string(), z.any())).describe("数据数组").optional(),
                    dataKeys: z.array(z.string()).describe("数据系列键名数组").optional(),
                    categoryKey: z.string().describe("分类键名").optional(),
                    colorScheme: z.enum(COLOR_PALETTES.map(p => p.key) as [string, ...string[]]).describe("色彩方案").optional(),
                    showLegend: z.boolean().describe("是否显示图例").optional(),
                    showGrid: z.boolean().describe("是否显示网格线").optional(),
                    showDataLabels: z.boolean().describe("是否显示数据标签").optional(),
                    smoothLine: z.boolean().describe("是否平滑曲线").optional(),
                    stacked: z.boolean().describe("是否堆叠").optional(),
                    horizontal: z.boolean().describe("是否水平").optional(),
                    height: z.number().describe("图表高度").optional(),
                    innerRadius: z.number().describe("饼图内半径").optional(),
                    seriesConfig: z.record(z.string(), z.object({
                        type: z.enum(['bar', 'line', 'area']).describe("该系列的图表类型"),
                        yAxisId: z.enum(['left', 'right']).describe("使用哪个 Y 轴").optional(),
                    })).describe("组合图表的系列配置").optional(),
                    rightYAxis: z.boolean().describe("是否显示右侧 Y 轴").optional(),
                }).describe("要更新的图表配置（仅包含需要更新的字段）")
            }),
            execute: (editor: Editor) => async (params: { position: number; chartConfig: Partial<ChartData> }) => {
                try {
                    const { position, chartConfig } = params;

                    const chartNodes = findChartNodes(editor);
                    const targetNode = chartNodes.find(node => node.pos === position);

                    if (!targetNode) {
                        return {
                            success: false,
                            error: `No chart found at position ${position}. Use listCharts to find available charts.`,
                            availablePositions: chartNodes.map(n => n.pos)
                        };
                    }

                    const node = editor.state.doc.nodeAt(position);
                    if (!node || node.type.name !== 'chart') {
                        return { success: false, error: `Invalid node at position ${position}` };
                    }

                    // Merge existing data with updates
                    const existingData = targetNode.data || {};
                    const mergedData = { ...existingData, ...chartConfig };
                    // Strip deprecated `colors` field — it breaks light/dark mode adaptation
                    // and can cause CSS variable resolution failures (resulting in black bars).
                    delete (mergedData as any).colors;

                    const newNode = node.type.create({ ...node.attrs, data: JSON.stringify(mergedData) });
                    const tr = editor.state.tr;
                    tr.replaceWith(position, position + node.nodeSize, newNode);
                    editor.view.dispatch(tr);

                    return {
                        success: true,
                        message: 'Chart updated successfully',
                        position,
                        chartType: mergedData.type
                    };
                } catch (error) {
                    return {
                        success: false,
                        error: `Failed to update chart: ${error instanceof Error ? error.message : String(error)}`
                    };
                }
            }
        },

        // Tool 4: Delete Chart
        {
            name: 'deleteChart',
            description: '删除文档中指定位置的图表。需要先使用 listCharts 获取图表位置。',
            inputSchema: z.object({
                position: z.number().describe("要删除的图表的位置（通过 listCharts 获取）")
            }),
            execute: (editor: Editor) => async (params: { position: number }) => {
                try {
                    const { position } = params;

                    const chartNodes = findChartNodes(editor);
                    const targetNode = chartNodes.find(node => node.pos === position);

                    if (!targetNode) {
                        return {
                            success: false,
                            error: `No chart found at position ${position}. Use listCharts to find available charts.`,
                            availablePositions: chartNodes.map(n => n.pos)
                        };
                    }

                    editor.chain()
                        .focus()
                        .deleteRange({ from: position, to: position + targetNode.nodeSize })
                        .run();

                    return {
                        success: true,
                        message: 'Chart deleted successfully',
                        deletedPosition: position,
                        deletedChartType: targetNode.data?.type || 'unknown'
                    };
                } catch (error) {
                    return {
                        success: false,
                        error: `Failed to delete chart: ${error instanceof Error ? error.message : String(error)}`
                    };
                }
            }
        },

        // Tool 5: Get Chart Templates
        {
            name: 'getChartTemplates',
            description: '获取所有可用的图表类型模板和示例数据。用于了解支持的图表类型和数据结构格式。',
            inputSchema: z.object({
                chartType: z.enum([
                    'bar', 'line', 'area', 'pie', 'radar', 'radialBar', 'scatter', 'compose', 'all'
                ]).describe("要获取的图表类型模板，'all' 返回所有模板").optional()
            }),
            execute: (_editor: Editor) => async (params: { chartType?: keyof typeof CHART_TEMPLATES | 'all' }) => {
                const { chartType = 'all' } = params;

                if (chartType === 'all') {
                    return {
                        success: true,
                        templates: CHART_TEMPLATES,
                        availableTypes: Object.keys(CHART_TEMPLATES),
                        message: 'All chart templates retrieved successfully'
                    };
                }

                const template = CHART_TEMPLATES[chartType as keyof typeof CHART_TEMPLATES];
                if (!template) {
                    return {
                        success: false,
                        error: `Unknown chart type: ${chartType}`,
                        availableTypes: Object.keys(CHART_TEMPLATES)
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
    ],
    skills: [chartSkill]
}
