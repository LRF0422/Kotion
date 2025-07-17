import { Avatar, AvatarFallback, AvatarImage } from "@kn/ui";
import React from "react";

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
    return <Avatar className={props.className} onClick={props.onClick}>
        <AvatarImage src={`http://www.simple-platform.cn:88/knowledge-resource/oss/endpoint/download?fileName=${props.userInfo?.avatar}`} />
        <AvatarFallback>{props.userInfo?.account}</AvatarFallback>
    </Avatar>
}