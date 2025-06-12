"use client"

import { PlusIcon, Trash2Icon, TrendingUp } from "@repo/icon"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger, Bar, BarChart, CartesianGrid, ColorPicker, IconButton, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, XAxis } from "@repo/ui"

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
import { uuidv4 } from "lib0/random"
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

    const { data, columns, updateAttributes, config, t } = props
    const { editor, node } = useContext(NodeViewContext)


    useEffect(() => {
        console.log('config', config);
        console.log('node attrs', node.attrs);
        console.log('props', props)
    }, [config])

    return <div className="flex w-full h-full items-stretch ">
        <div className="w-[300px] not-prose border-r bg-muted overflow-auto">
            <Accordion type="multiple" defaultValue={["x", "y", "title"]}>
                <AccordionItem value="x" >
                    <AccordionTrigger className="p-2" >X-axis</AccordionTrigger>
                    <AccordionContent className="p-1">
                        <Card>
                            <CardContent className="p-2">
                                <Select defaultValue={config.xAxis} onValueChange={(value) => {
                                    config.xAxis = value
                                    updateAttributes({
                                        ...node.attrs,
                                        [props.viewKey]: { ...config }
                                    })
                                    t()
                                }}>
                                    <SelectTrigger className="h-7">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {
                                            columns.map((column: any, index: number) => (
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
                    <AccordionContent>
                        <Card>
                            <CardContent className="p-2 space-y-3">
                                {
                                    config.yAxis ? config.yAxis.map((it: any, index: number) => (
                                        <div className=" space-x-1 flex items-center" key={index}>
                                            <Select defaultValue={it.value} onValueChange={(value) => {
                                                const item = config.yAxis.find((i: any) => i.key === it.key)
                                                item.value = value
                                                config.yAxis = [...(config.yAxis || [])]
                                                updateAttributes({
                                                    ...node.attrs,
                                                    [props.viewKey]: { ...config }
                                                })
                                                t()
                                            }}>
                                                <SelectTrigger className="h-7">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {
                                                        columns.map((column: any, index: number) => (
                                                            <SelectItem key={index} value={column.id}>
                                                                {column.title}
                                                            </SelectItem>
                                                        ))
                                                    }
                                                </SelectContent>
                                            </Select>
                                            <ColorPicker simple background="" setBackground={() => {

                                            }} />
                                            <IconButton icon={<PlusIcon className="h-4 w-4" />} onClick={() => {
                                                config.yAxis = [...(config.yAxis || []), {
                                                    value: "",
                                                    key: uuidv4(),
                                                }]
                                                updateAttributes({
                                                    ...node.attrs,
                                                    [props.viewKey]: { ...config }
                                                })
                                                t()
                                            }} />
                                            <IconButton icon={<Trash2Icon className="h-4 w-4" />} onClick={() => {
                                                config.yAxis = config.yAxis.filter((i: any) => i.key !== it.key)
                                                updateAttributes({
                                                    ...node.attrs,
                                                    [props.viewKey]: { ...config }
                                                })
                                                t()
                                            }} />
                                        </div>
                                    )) : <IconButton icon={<PlusIcon />} onClick={() => {
                                        config.yAxis = [...(config.yAxis || []), {
                                            value: "",
                                            key: uuidv4(),
                                        }]
                                        updateAttributes({
                                            ...node.attrs,
                                            [props.viewKey]: { ...config }
                                        })
                                        t()
                                    }} />
                                }
                            </CardContent>
                        </Card>
                    </AccordionContent>
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
                                            [props.viewKey]: { ...config }
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
                                            [props.viewKey]: { ...config }
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
                            dataKey={config.xAxis || ""}
                            tickLine={false}
                            tickMargin={10}
                            axisLine={false}
                        // tickFormatter={(value) => value.slice(0, 3)}
                        />
                        <ChartTooltip
                            cursor={false}
                            content={<ChartTooltipContent indicator="dashed" />}
                        />
                        {
                            config.yAxis && config.yAxis.map((yAxis: any, index: number) => (
                                <Bar dataKey={yAxis.value} key={index} fill={
                                    yAxis.color || "var(--color-desktop)"
                                } radius={4} />
                            ))
                        }
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

