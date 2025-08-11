

import { TrendingUp } from "@kn/icon"
import { Area, AreaChart, CartesianGrid, XAxis } from "@kn/ui"

import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@kn/ui"
import {
    ChartConfig,
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
} from "@kn/ui"
import React from "react"
import { ChartKit } from "./types"
import { BaseChart } from "./BaseChart"
const chartData = [
    { month: "January", desktop: 186 },
    { month: "February", desktop: 305 },
    { month: "March", desktop: 237 },
    { month: "April", desktop: 73 },
    { month: "May", desktop: 209 },
    { month: "June", desktop: 214 },
]

const chartConfig = {
    desktop: {
        label: "Desktop",
        color: "hsl(var(--chart-1))",
    },
} satisfies ChartConfig

const Component: React.FC<any> = (props) => {
    const { data, columns, updateAttributes, config, t } = props
    return (<BaseChart
        config={config}
        configPanel={
            <></>
        }
        chart={
            <ChartContainer config={chartConfig}>
                <AreaChart
                    accessibilityLayer
                    data={chartData}
                    margin={{
                        left: 12,
                        right: 12,
                    }}
                >
                    <CartesianGrid vertical={false} />
                    <XAxis
                        dataKey="month"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                        tickFormatter={(value) => value.slice(0, 3)}
                    />
                    <ChartTooltip
                        cursor={false}
                        content={<ChartTooltipContent indicator="line" />}
                    />
                    <Area
                        dataKey="desktop"
                        type="natural"
                        fill="var(--color-desktop)"
                        fillOpacity={0.4}
                        stroke="var(--color-desktop)"
                    />
                </AreaChart>
            </ChartContainer>
        }
    />
    )
}

export default {
    component: Component,
    name: "Area Chart",
} as ChartKit
