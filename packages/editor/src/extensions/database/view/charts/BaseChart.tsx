import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@repo/ui";
import React from "react";


export interface BaseChartProps {
    configPanel: React.ReactNode
    chart: React.ReactNode
    config: any
}

export const BaseChart: React.FC<BaseChartProps> = (props) => {

    const config = props.config

    return <div className="flex w-full h-full items-stretch ">
        <div className="w-[300px] not-prose border-r bg-muted overflow-auto">
            {props.configPanel}
        </div>
        <Card className=" border-none flex-1">
            <CardHeader>
                <CardTitle>{config.title}</CardTitle>
                <CardDescription>{config.desc}</CardDescription>
            </CardHeader>
            <CardContent >
                {props.chart}
            </CardContent>
            <CardFooter className="flex-col items-start gap-2 text-sm">
                <div className="flex gap-2 font-medium leading-none">
                    {config.footer}
                </div>
                <div className="leading-none text-muted-foreground">
                    {config.footerDesc}
                </div>
            </CardFooter>
        </Card>
    </div>
}