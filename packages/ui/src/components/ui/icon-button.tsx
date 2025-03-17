import { cn } from "@ui/lib/utils";
import React from "react";


export interface IconButtonProps {
    icon: React.ReactNode;
    onClick?: () => void;
    className?: string;
    disabled?: boolean;
}
export const IconButton: React.FC<IconButtonProps> = (props) => {
    return <div className={cn("p-1 hover:bg-muted rounded-md cursor-pointer flex items-center justify-center", props.className)} onClick={props.onClick} >
        {props.icon}
    </div>
}