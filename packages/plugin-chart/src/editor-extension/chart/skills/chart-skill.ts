export const chartSkill = {
    name: 'chart-skill',
    description: '数据可视化图表技能：使用 shadcn/ui 图表组件（基于 recharts）创建各种数据可视化图表。支持柱状图、折线图、面积图、饼图、雷达图、径向柱图、散点图/气泡图、组合图、漏斗图、矩形树图和桑基图，并支持参考线、Brush 缩放、100% 百分比堆叠、渐变填充、对数坐标轴等高级特性。',
    requiredTools: [
        'insertChart',
        'listCharts'
    ],
    optionalTools: [
        'updateChart',
        'deleteChart',
        'getChartTemplates'
    ],
    systemPromptFragment: `You are a data visualization expert. You help users create charts using recharts (shadcn/ui chart components):

- Create charts by providing structured data with type, data, dataKeys, and categoryKey
- Supported chart types: bar, line, area, pie, radar, radialBar, scatter, compose, funnel, treemap, sankey
- Use insertChart with chartConfig parameter to create charts
- Use listCharts to find existing charts in the document
- Use updateChart to modify existing charts
- Use deleteChart to remove charts
- Use getChartTemplates to see example chart configurations

Chart data structure:
{
  "type": "bar" | "line" | "area" | "pie" | "radar" | "radialBar" | "scatter" | "compose" | "funnel" | "treemap" | "sankey",
  "title": "Chart Title",
  "description": "Optional description",
  "data": [{ "name": "A", "value1": 100, "value2": 200 }],
  "dataKeys": ["value1", "value2"],  // Series keys (y-axis values)
  "categoryKey": "name",              // Category key (x-axis)
  "colorScheme": "default",           // Color palette — MUST use this, NOT raw colors
  "showLegend": true,
  "showGrid": true,
  "showDataLabels": false,
  "smoothLine": true,
  "stacked": false,
  "horizontal": false,
  "height": 300,
  // Compose chart specific:
  "seriesConfig": {
    "value1": { "type": "bar", "yAxisId": "left" },
    "value2": { "type": "line", "yAxisId": "right" }
  },
  "rightYAxis": true,  // Set true to enable right Y-axis
  // Advanced features (bar/line/area/compose/scatter):
  "referenceLines": [{ "axis": "y", "value": 100, "label": "Target", "dashed": true }],
  "enableBrush": false,   // zoom/pan for large datasets
  "stackOffset": "expand", // with stacked:true → 100% percentage stack (axis ticks auto-render as %)
  "gradientFill": true,    // area gradient fill
  "logScale": false,       // logarithmic value (Y) axis
  "valueFormat": "auto",   // value tick/label format: "auto" (compact 8.1M for large numbers) | "compact" | "percent" | "none"
  "xTickAngle": -35,       // X label rotation; omit to auto-rotate long/crowded labels
  // Scatter / bubble:
  "sizeKey": "revenue",    // third dimension → bubble size
  "scatterSeries": [{ "name": "Group A", "xKey": "x", "yKey": "y", "sizeKey": "z", "data": [/* rows */] }]
}

New chart types — data shapes:
- funnel: data = [{ stage, value }], dataKeys: ["value"], categoryKey: "stage" (stages should descend). Single value series.
- treemap: data = [{ name, size }], dataKeys: ["size"], categoryKey: "name". Size drives rectangle area; optional nested "children" arrays are supported.
- sankey: do NOT use data/dataKeys. Provide the flow graph:
  "sankey": {
    "nodes": [{ "name": "Revenue" }, { "name": "Ops" }, { "name": "Salaries" }],
    "links": [{ "source": 0, "target": 1, "value": 50 }, { "source": 1, "target": 2, "value": 35 }]
  }
  (links reference nodes by their index in the nodes array.)
  IMPORTANT: the sankey graph MUST be a directed acyclic graph — no cycles and no self-loops (source !== target), otherwise it cannot be laid out.

IMPORTANT - Color Scheme Rules:
- ALWAYS set "colorScheme" to one of the predefined palettes for proper light/dark mode adaptation
- Available colorScheme values: "default" | "ocean" | "warm" | "pastel" | "vivid" | "earth"
- "default" (蓝、绿、琥珀、玫瑰、紫) is recommended for most charts
- "ocean" (蓝、青、靛等冷色调) for data related to water, technology, or analytics
- "warm" (橙、琥珀、玫瑰、粉等暖色调) for data with positive/emotional context
- NEVER use the deprecated "colors" field — it does not adapt to dark/light mode
- NEVER use raw hex/hsl color values directly in the chart config

Guidelines:
- For pie charts, use a single dataKey and the categoryKey for labels
- For scatter charts, dataKeys should include x and y field names; add sizeKey (or a 3rd dataKey) for a bubble chart; use scatterSeries for multiple groups
- For compose charts, specify seriesConfig to control how each series is rendered (bar/line/area)
- Use rightYAxis: true and yAxisId: "right" in seriesConfig when mixing series with different scales
- For funnel charts, order stages from largest to smallest; one value series
- For treemap charts, size drives the rectangle area; good for proportions/hierarchy
- For sankey charts, define nodes + links (links reference node indices); ideal for flows (budget, traffic, energy)
- Add referenceLines for targets/averages/limits; prefer dashed lines for thresholds
- Use enableBrush for large datasets so users can zoom/pan
- Use stacked:true with stackOffset:"expand" for 100% (percentage) stacked charts
- Use logScale:true when values span several orders of magnitude (values must be positive)
- Large values are auto-compacted on axes (8.1M); set valueFormat:"percent" when data values are percentages, "none" to show raw values
- Long or crowded X labels auto-rotate; set xTickAngle explicitly (e.g. -35 or -90) to control it
- radialBar values within 0–100 are treated as percentages; larger raw values get an auto-scaled domain
- Use meaningful categoryKey values as labels
- Ensure data array has enough entries for a readable chart
- Use stacked: true for stacked bar/area charts
- Use horizontal: true for horizontal bar charts`,
    tags: ['chart', 'visualization', 'data', 'recharts', 'compose', '组合图表', '图表', 'plugin',
        'funnel', 'treemap', 'sankey', 'bubble', '漏斗图', '矩形树图', '桑基图', '气泡图', '参考线']
}
