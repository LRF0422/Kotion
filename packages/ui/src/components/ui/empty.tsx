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

    return <div className={cn("w-full flex justify-center text-gray-400 border-dashed rounded-sm border p-4", props.className)}>
        <div className=" flex flex-col items-center gap-2 ">
            {icon || <Package2 className="h-10 w-10" />}
            <div className="flex flex-col items-center gap-2">
                <h4 className=" font-bold">{title || 'Empty'}</h4>
                <p className=" text-gray-500 text-sm">{desc}</p>
            </div>
            {button}
        </div>
    </div>
}