import { ExtensionWrapper, resolveBlockInsertPosition } from "@kn/common";
import { Chart } from "./chart";
import { BarChart3 } from "@kn/icon";
import React from "react";
import { z } from "@kn/ui";
import type { Editor } from "@kn/editor";
import type { ChartData, SeriesConfig } from "./chart";
import { chartSkill } from "./skills/chart-skill";
import { COLOR_PALETTES } from "./chart-colors";
import { createT } from "../../i18n";

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
    funnel: {
        type: "funnel",
        title: "Conversion Funnel",
        data: [
            { stage: "Visits", value: 12000 },
            { stage: "Sign-ups", value: 7200 },
            { stage: "Activated", value: 4100 },
            { stage: "Paying", value: 1800 },
            { stage: "Renewed", value: 950 },
        ],
        dataKeys: ["value"],
        categoryKey: "stage",
        colorScheme: "ocean",
        showDataLabels: true,
        height: 320,
    },
    treemap: {
        type: "treemap",
        title: "Storage by Category",
        data: [
            { name: "Documents", size: 4200 },
            { name: "Images", size: 3100 },
            { name: "Videos", size: 6800 },
            { name: "Audio", size: 1400 },
            { name: "Archives", size: 900 },
            { name: "Other", size: 600 },
        ],
        dataKeys: ["size"],
        categoryKey: "name",
        colorScheme: "vivid",
        height: 320,
    },
    sankey: {
        type: "sankey",
        title: "Budget Flow",
        data: [],
        dataKeys: [],
        colorScheme: "default",
        sankey: {
            nodes: [
                { name: "Revenue" },
                { name: "Operations" },
                { name: "Marketing" },
                { name: "R&D" },
                { name: "Salaries" },
                { name: "Tools" },
            ],
            links: [
                { source: 0, target: 1, value: 50 },
                { source: 0, target: 2, value: 30 },
                { source: 0, target: 3, value: 20 },
                { source: 1, target: 4, value: 35 },
                { source: 1, target: 5, value: 15 },
                { source: 3, target: 4, value: 12 },
            ],
        },
        height: 360,
    },
    bubble: {
        type: "scatter",
        title: "Market Segments (size = revenue)",
        data: [
            { reach: 25, engagement: 40, revenue: 120 },
            { reach: 60, engagement: 55, revenue: 300 },
            { reach: 45, engagement: 80, revenue: 220 },
            { reach: 80, engagement: 30, revenue: 180 },
            { reach: 35, engagement: 65, revenue: 90 },
            { reach: 70, engagement: 75, revenue: 420 },
        ],
        dataKeys: ["reach", "engagement", "revenue"],
        sizeKey: "revenue",
        colorScheme: "warm",
        showLegend: false,
        showGrid: true,
        height: 320,
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

const t = createT();

export const ChartExtension: ExtensionWrapper = {
    name: Chart.name,
    extendsion: [Chart],
    slashConfig: [
        {
            text: t('slashCommands.chart'),
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
- scatter: 散点图/气泡图，用于展示两个变量的关系（设置 sizeKey 即为气泡图）
- compose: 组合图表，在同一图表中混合柱状图、折线图、面积图，支持双 Y 轴
- funnel: 漏斗图，用于转化分析（各阶段逐级递减）
- treemap: 矩形树图，用于占比/层级面积展示
- sankey: 桑基图，用于展示流量/资金/能量等流向（用 sankey.{nodes,links} 定义）

必须提供 chartConfig 参数。除 sankey 外需包含 type、data、dataKeys；sankey 改用 sankey 字段。

高级特性（适用于 bar/line/area/compose/scatter 直角坐标系图表）：
- referenceLines: 参考线/阈值线，用于标注目标、均值、上限
- enableBrush: 大数据集启用缩放/平移
- stacked + stackOffset:'expand': 100% 百分比堆叠
- gradientFill: 面积图渐变填充
- logScale: 数值轴对数刻度（数据跨越多个量级时）

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
                    type: z.enum(['bar', 'line', 'area', 'pie', 'radar', 'radialBar', 'scatter', 'compose', 'funnel', 'treemap', 'sankey']).describe("图表类型"),
                    title: z.string().describe("图表标题").optional(),
                    description: z.string().describe("图表描述").optional(),
                    data: z.array(z.record(z.string(), z.any())).describe("数据数组，每个元素是一个数据点对象（sankey 类型改用 sankey 字段，可省略）").optional(),
                    dataKeys: z.array(z.string()).describe("数据系列键名数组（对应 y 轴值；funnel/treemap 取第一个；sankey 不需要）").optional(),
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
                    // --- 高级特性（适用于 bar/line/area/compose/scatter 直角坐标系图表）---
                    referenceLines: z.array(z.object({
                        axis: z.enum(['x', 'y']).describe("参考线锚定的坐标轴，'y' 为水平线（默认）").optional(),
                        value: z.union([z.number(), z.string()]).describe("参考线所在的值（x 轴可为分类值）"),
                        label: z.string().describe("参考线标签").optional(),
                        color: z.string().describe("参考线颜色，缺省自动取配色").optional(),
                        dashed: z.boolean().describe("是否虚线，默认 true").optional(),
                    })).describe("参考线/阈值线，用于目标、均值、上限等标注").optional(),
                    enableBrush: z.boolean().describe("是否显示 Brush 缩放控件（适合大数据集）").optional(),
                    stackOffset: z.enum(['none', 'expand']).describe("堆叠方式，'expand' 为 100% 百分比堆叠（需配合 stacked:true）").optional(),
                    gradientFill: z.boolean().describe("面积图/组合图的面积系列是否使用渐变填充").optional(),
                    logScale: z.boolean().describe("数值轴(Y)是否使用对数刻度").optional(),
                    valueFormat: z.enum(['auto', 'compact', 'percent', 'none']).describe("数值轴刻度/数据标签格式：'auto'（默认，大数自动缩写为 8.1M）、'compact'（始终缩写）、'percent'（追加 %）、'none'（原始值）。100% 堆叠图始终显示百分比刻度").optional(),
                    xTickAngle: z.number().describe("X 轴分类标签旋转角度（如 -35）。缺省时标签过长/过密会自动旋转").optional(),
                    // --- 散点/气泡 ---
                    sizeKey: z.string().describe("气泡大小对应的字段名（散点图第三维度，启用气泡图）").optional(),
                    scatterSeries: z.array(z.object({
                        name: z.string().describe("系列名称"),
                        xKey: z.string().describe("X 轴字段名"),
                        yKey: z.string().describe("Y 轴字段名"),
                        sizeKey: z.string().describe("气泡大小字段名").optional(),
                        data: z.array(z.record(z.string(), z.any())).describe("该系列数据，缺省使用顶层 data").optional(),
                    })).describe("多组散点/气泡系列；设置后覆盖基于 dataKeys 的单系列行为").optional(),
                    // --- 桑基图 ---
                    sankey: z.object({
                        nodes: z.array(z.object({ name: z.string() })).describe("节点列表，顺序决定 links 引用的索引"),
                        links: z.array(z.object({
                            source: z.number().describe("源节点索引"),
                            target: z.number().describe("目标节点索引"),
                            value: z.number().describe("流量/权重"),
                        })).describe("节点之间的加权连接"),
                    }).describe("桑基图的节点/连接图（type 为 'sankey' 时必填）").optional(),
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
                    if (chartConfig.type === 'sankey') {
                        // Sankey uses a node/link graph instead of a flat data array.
                        if (!chartConfig.sankey?.nodes?.length || !chartConfig.sankey?.links?.length) {
                            return { success: false, error: 'sankey charts require chartConfig.sankey with non-empty nodes and links' };
                        }
                    } else {
                        if (!chartConfig.data || !Array.isArray(chartConfig.data) || chartConfig.data.length === 0) {
                            return { success: false, error: 'chartConfig.data must be a non-empty array' };
                        }
                        // funnel/treemap need at least one dataKey; multi-series scatter may use scatterSeries instead.
                        const hasScatterSeries = chartConfig.type === 'scatter' && Array.isArray(chartConfig.scatterSeries) && chartConfig.scatterSeries.length > 0;
                        if (!hasScatterSeries && (!chartConfig.dataKeys || !Array.isArray(chartConfig.dataKeys) || chartConfig.dataKeys.length === 0)) {
                            return { success: false, error: 'chartConfig.dataKeys must be a non-empty array of series key names' };
                        }
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
                                dataPoints: chartConfig.data?.length ?? 0,
                                series: chartConfig.dataKeys?.length ?? 0
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
                        dataPoints: chartConfig.data?.length ?? 0,
                        series: chartConfig.dataKeys?.length ?? 0
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
                    type: z.enum(['bar', 'line', 'area', 'pie', 'radar', 'radialBar', 'scatter', 'compose', 'funnel', 'treemap', 'sankey']).describe("图表类型").optional(),
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
                    referenceLines: z.array(z.object({
                        axis: z.enum(['x', 'y']).describe("参考线锚定的坐标轴").optional(),
                        value: z.union([z.number(), z.string()]).describe("参考线所在的值"),
                        label: z.string().describe("参考线标签").optional(),
                        color: z.string().describe("参考线颜色").optional(),
                        dashed: z.boolean().describe("是否虚线").optional(),
                    })).describe("参考线/阈值线").optional(),
                    enableBrush: z.boolean().describe("是否显示 Brush 缩放控件").optional(),
                    stackOffset: z.enum(['none', 'expand']).describe("'expand' 为 100% 百分比堆叠").optional(),
                    gradientFill: z.boolean().describe("面积系列是否渐变填充").optional(),
                    logScale: z.boolean().describe("数值轴是否对数刻度").optional(),
                    valueFormat: z.enum(['auto', 'compact', 'percent', 'none']).describe("数值格式：auto/compact/percent/none").optional(),
                    xTickAngle: z.number().describe("X 轴标签旋转角度").optional(),
                    sizeKey: z.string().describe("气泡大小字段名").optional(),
                    scatterSeries: z.array(z.object({
                        name: z.string().describe("系列名称"),
                        xKey: z.string().describe("X 轴字段名"),
                        yKey: z.string().describe("Y 轴字段名"),
                        sizeKey: z.string().describe("气泡大小字段名").optional(),
                        data: z.array(z.record(z.string(), z.any())).describe("该系列数据").optional(),
                    })).describe("多组散点/气泡系列").optional(),
                    sankey: z.object({
                        nodes: z.array(z.object({ name: z.string() })).describe("节点列表"),
                        links: z.array(z.object({
                            source: z.number().describe("源节点索引"),
                            target: z.number().describe("目标节点索引"),
                            value: z.number().describe("流量/权重"),
                        })).describe("加权连接"),
                    }).describe("桑基图节点/连接图").optional(),
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
                    'bar', 'line', 'area', 'pie', 'radar', 'radialBar', 'scatter', 'compose',
                    'funnel', 'treemap', 'sankey', 'bubble', 'all'
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
