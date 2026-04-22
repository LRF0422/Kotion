import React, { ReactNode } from "react";
import { Empty, EmptyProps } from "@kn/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@kn/ui";
import { cn } from "@kn/ui";
import { useUploadFile } from "@kn/common";

export interface CardListProps {
    data: any[],
    emptyProps?: EmptyProps
    cols?: number
    onClick?: (data: any) => void
    icon?: (data: any) => ReactNode
    footer?: (data: any) => ReactNode
    extra?: (data: any) => ReactNode
    containerClassName?: string
    className?: string
    config?: { desc?: string, cover?: string, name?: string }
    descFormatter?: (data: any) => ReactNode
}

export const CardList: React.FC<CardListProps> = (props) => {
    const { cols = 4, containerClassName } = props;
    const { usePath } = useUploadFile()
    return (props.data?.length > 0 &&
        <div className={cn("grid gap-4 w-full grid-cols-4", containerClassName)}>
            {props.data.map((it: any, index) => (
                <div key={index}>
                    <Card className={cn(" hover:bg-muted transition-all my-0 cursor-pointer", props.className)}
                        style={props.config?.cover ? {
                            backgroundImage: `url('${usePath(it[props.config.cover])}')`,
                            backgroundSize: 'cover'
                        } : {}}
                        onClick={() => {
                            props.onClick && props.onClick(it)
                        }} >
                        <CardHeader className="flexz h-[50px] flex-row items-center gap-2 rounded-t-xl  ">
                            {<CardTitle className="text-[30px] font-bold">{props.icon && props.icon(it)}</CardTitle>}
                            {props.extra && props.extra(it)}
                        </CardHeader>
                        {
                            (props.config?.name || props.config?.desc) && <CardContent className=" text-nowrap overflow-hidden text-ellipsis">
                                {props.config?.name && <p className="text-base font-bold text-ellipsis overflow-hidden">{it[props.config.name]}</p>}
                                {props.config?.desc && <p className="text-xs text-muted-foreground text-ellipsis overflow-hidden">{props.descFormatter ? props.descFormatter(it) : it[props.config.desc]}</p>}
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