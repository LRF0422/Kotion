import { cn } from "@ui/lib/utils";
import React from "react";


export interface IconButtonProps {
    icon: React.ReactNode;
    onClick?: () => void;
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
        onClick={() => {
            if (!props.disabled) {
                props.onClick?.()
            }
        }} >
        {props.icon}
    </div>
}