import { Box, Package2 } from "@kn/icon";
import React, { ReactNode } from "react";
import { Button } from "./button";
import { cn } from "@ui/lib/utils";

export interface EmptyProps {
    title?: string,
    desc?: string,
    button?: ReactNode,
    icon?: ReactNode,
    className?: string
}

export const Empty: React.FC<EmptyProps> = (props) => {

    const { title, desc, button, icon } = props

    return <div className={cn("w-full flex justify-center text-muted-foreground border-dashed rounded-sm border p-3", props.className)}>
        <div className=" flex flex-col items-center gap-1.5 ">
            {icon || <Package2 className="h-10 w-10" />}
            <div className="flex flex-col items-center gap-1">
                <h4 className="font-medium text-xs">{title || 'Empty'}</h4>
                {desc && <p className=" text-muted-foreground text-[11px] leading-tight">{desc}</p>}
            </div>
            {button}
        </div>
    </div>
}