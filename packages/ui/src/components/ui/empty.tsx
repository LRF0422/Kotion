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

    return <div className={cn("w-full flex justify-center text-center py-8", props.className)}>
        <div className="flex flex-col items-center gap-2">
            <div className="text-muted-foreground/40">
                {icon || <Package2 className="h-5 w-5" />}
            </div>
            <div className="flex flex-col items-center gap-1">
                <p className="text-sm text-muted-foreground font-medium">{title || 'Empty'}</p>
                {desc && <p className="text-xs text-muted-foreground/70">{desc}</p>}
            </div>
            {button}
        </div>
    </div>
}