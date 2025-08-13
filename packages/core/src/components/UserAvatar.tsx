import { Avatar, AvatarFallback, AvatarImage } from "@kn/ui";
import React from "react";
import { useUploadFile } from "../hooks";

export interface UserAvatarProps {
    userInfo?: {
        name?: string;
        avatar?: string;
        account?: string;
        job?: string;
        organization?: string;
        location?: string;
        email?: string;
        id?: string;
    },
    className?: string
    onClick?: () => void
}

export const UserAvatar: React.FC<UserAvatarProps> = (props) => {

    const { usePath } = useUploadFile()
    
    return <Avatar className={props.className} onClick={props.onClick}>
        <AvatarImage src={usePath(props.userInfo?.avatar as string)} />
        <AvatarFallback>{props.userInfo?.account}</AvatarFallback>
    </Avatar>
}