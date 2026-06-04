import React, { ReactNode } from "react";
import { Empty, EmptyProps } from "@kn/ui";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@kn/ui";
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
                <Card
                    key={index}
                    className={cn(
                        "group cursor-pointer border-border/50 hover:border-border hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200",
                        props.className
                    )}
                    style={props.config?.cover ? {
                        backgroundImage: `url('${usePath(it[props.config.cover])}')`,
                        backgroundSize: 'cover'
                    } : {}}
                    onClick={() => {
                        props.onClick && props.onClick(it)
                    }}
                >
                    <CardHeader className="h-[50px] flex-row items-center gap-2 rounded-t-xl">
                        <CardTitle className="text-[30px] font-bold leading-none">{props.icon && props.icon(it)}</CardTitle>
                        {props.extra && props.extra(it)}
                    </CardHeader>
                    {
                        (props.config?.name || props.config?.desc) && <CardContent className="text-nowrap overflow-hidden text-ellipsis">
                            {props.config?.name && <p className="text-sm font-semibold text-ellipsis overflow-hidden truncate">{it[props.config.name]}</p>}
                            {props.config?.desc && <p className="text-xs text-muted-foreground text-ellipsis overflow-hidden truncate">{props.descFormatter ? props.descFormatter(it) : it[props.config.desc]}</p>}
                        </CardContent>
                    }
                    {
                        props.footer && <CardFooter className="pt-0 pb-2">
                            {props.footer(it)}
                        </CardFooter>
                    }
                </Card>
            ))}
        </div>) || <Empty {...props.emptyProps} />
}