import React, { ReactNode } from "react";
import { Empty, EmptyProps } from "@kn/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@kn/ui";
import { cn } from "@kn/ui";

export interface CardListProps {
    data: any[],
    emptyProps?: EmptyProps
    onClick?: (data: any) => void
    icon?: (data: any) => ReactNode
    footer?: (data: any) => ReactNode
    className?: string
    config?: { desc?: string, extra?: ReactNode, cover?: string, name?: string }
}

export const CardList: React.FC<CardListProps> = (props) => {
    return (props.data?.length > 0 && <div className="grid grid-cols-4 gap-4 w-full">
        {props.data.map((it: any, index) => (
            <div key={index}>
                <Card className={cn(" hover:bg-muted transition-all my-0 cursor-pointer", props.config?.cover && ` bg-[url('http://www.simple-platform.cn:88/knowledge-resource/oss/endpoint/download?fileName=${it[props.config.cover]}')]`, props.className)}
                    style={props.config?.cover ? {
                        backgroundImage: `url('http://www.simple-platform.cn:88/knowledge-resource/oss/endpoint/download?fileName=${it[props?.config?.cover]}')`,
                        backgroundSize: 'cover'
                    } : {}}
                    onClick={() => {
                        props.onClick && props.onClick(it)
                    }} >
                    <CardHeader className="flexz h-[50px] flex-row items-center gap-2 rounded-t-xl  ">
                        {<CardTitle className="text-[30px] font-bold">{props.icon && props.icon(it)}</CardTitle>}
                        {props.config && props.config.extra}
                    </CardHeader>
                    {
                        props.config?.name && <CardContent className=" text-nowrap overflow-hidden text-ellipsis">
                            <p className="text-base h-[50px] font-bold text-ellipsis overflow-hidden">{it[props.config.name]}</p>
                        </CardContent>
                    }
                </Card>
                <div>
                    {props.footer && props.footer(it)}
                </div>
            </div>
        ))}
    </div>) || <Empty {...props.emptyProps} />
}