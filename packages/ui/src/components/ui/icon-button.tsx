import { cn } from "@ui/lib/utils";
import React from "react";


export interface IconButtonProps {
    icon: React.ReactNode;
    onClick?: (e?: any) => void;
    className?: string;
    disabled?: boolean;
}
export const IconButton: React.FC<IconButtonProps> = (props) => {
    return <div
        className={
            cn("p-1 hover:bg-muted rounded-md cursor-pointer flex items-center justify-center",
                props.className,
                props.disabled && "opacity-50 cursor-not-allowed"
            )
        }
        onClick={(e) => {
            if (!props.disabled) {
                props.onClick?.(e)
            }
        }} >
        {props.icon}
    </div>
}