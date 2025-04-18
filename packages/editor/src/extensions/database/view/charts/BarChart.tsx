"use client"

import { TrendingUp } from "@repo/icon"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger, Bar, BarChart, CartesianGrid, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, XAxis } from "@repo/ui"

import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@repo/ui"
import {
    ChartConfig,
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
} from "@repo/ui"
import React, { useContext, useEffect } from "react"
import { ChartKit } from "./types"
import { NodeViewContext } from "../../DatabaseView"
import { useToggle } from "ahooks"
const chartData = [
    { month: "January", desktop: 186, mobile: 80 },
    { month: "February", desktop: 305, mobile: 200 },
    { month: "March", desktop: 237, mobile: 120 },
    { month: "April", desktop: 73, mobile: 190 },
    { month: "May", desktop: 209, mobile: 130 },
    { month: "June", desktop: 214, mobile: 140 },
]

const chartConfig = {
    desktop: {
        label: "Desktop",
        color: "hsl(var(--chart-1))",
    },
    mobile: {
        label: "Mobile",
        color: "hsl(var(--chart-2))",
    },
} satisfies ChartConfig

const Component: React.FC<any> = (props) => {

    const { data, columns, node, updateAttributes } = useContext(NodeViewContext)
    const [flag, { toggle: t }] = useToggle(false)
    const config = node.attrs.viewOptions[props.viewKey] || {}

    return <div className="flex w-full h-full items-stretch ">
        <div className="w-[300px] not-prose border-r bg-muted overflow-auto">
            <Accordion type="multiple" >
                <AccordionItem value="x" >
                    <AccordionTrigger className="p-2" >X-axis</AccordionTrigger>
                    <AccordionContent className="p-1">
                        <Card>
                            <CardContent className="p-2">
                                <Select>
                                    <SelectTrigger className="h-7">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {
                                            columns.map((column, index) => (
                                                <SelectItem key={index} value={column.id}>
                                                    {column.title}
                                                </SelectItem>
                                            ))
                                        }
                                    </SelectContent>
                                </Select>
                            </CardContent>
                        </Card>
                    </AccordionContent>
                </AccordionItem>
                <AccordionItem value="y">
                    <AccordionTrigger className="p-2">Y-axis</AccordionTrigger>
                    <AccordionContent>123123</AccordionContent>
                </AccordionItem>
                <AccordionItem value="title">
                    <AccordionTrigger className="p-2">Title</AccordionTrigger>
                    <AccordionContent>
                        <Card>
                            <CardContent className="p-2 space-y-1">
                                <div className=" space-y-1">
                                    <Label htmlFor="title">Title</Label>
                                    <Input className="h-8" defaultValue={config.title} id="title" placeholder="Title" onChange={(e) => {
                                        config.title = e.target.value
                                        updateAttributes({
                                            ...node.attrs,
                                            viewOptions: {
                                                ...node.attrs.viewOptions,
                                                [props.viewKey]: { ...config }
                                            }
                                        })
                                        t()
                                    }} />
                                </div>
                                <div className=" space-y-1">
                                    <Label htmlFor="desc">Description</Label>
                                    <Input className="h-8" defaultValue={config.desc} id="desc" placeholder="Title" onChange={(e) => {
                                        config.desc = e.target.value
                                        updateAttributes({
                                            ...node.attrs,
                                            viewOptions: {
                                                ...node.attrs.viewOptions,
                                                [props.viewKey]: { ...config }
                                            }
                                        })
                                        t()
                                    }} />
                                </div>
                            </CardContent>
                        </Card>
                    </AccordionContent>
                </AccordionItem>
            </Accordion>
        </div>
        <Card className=" border-none flex-1">
            <CardHeader>
                <CardTitle>{config.title}</CardTitle>
                <CardDescription>{config.desc}</CardDescription>
            </CardHeader>
            <CardContent >
                <ChartContainer config={chartConfig} className=" shadow-none">
                    <BarChart accessibilityLayer data={data}>
                        <CartesianGrid vertical={false} />
                        <XAxis
                            dataKey="month"
                            tickLine={false}
                            tickMargin={10}
                            axisLine={false}
                            tickFormatter={(value) => value.slice(0, 3)}
                        />
                        <ChartTooltip
                            cursor={false}
                            content={<ChartTooltipContent indicator="dashed" />}
                        />
                        <Bar dataKey="desktop" fill="var(--color-desktop)" radius={4} />
                        <Bar dataKey="mobile" fill="var(--color-mobile)" radius={4} />
                    </BarChart>
                </ChartContainer>
            </CardContent>
            <CardFooter className="flex-col items-start gap-2 text-sm">
                <div className="flex gap-2 font-medium leading-none">
                    Trending up by 5.2% this month <TrendingUp className="h-4 w-4" />
                </div>
                <div className="leading-none text-muted-foreground">
                    Showing total visitors for the last 6 months
                </div>
            </CardFooter>
        </Card>
    </div>
}

export default {
    component: Component,
    name: "Bar Chart",
} as ChartKit

