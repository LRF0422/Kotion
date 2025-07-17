import { Separator } from "@kn/ui";
import { GlobalState } from "../../../store/GlobalState";
import React from "react";
import { useSelector } from "react-redux";
import { UserAvatar } from "../../UserAvatar";
import { Input } from "@kn/ui";
import { Button } from "@kn/ui";

export const MyAccount: React.FC = () => {

    const { userInfo } = useSelector((state: GlobalState) => state)

    return <div className="flex flex-col gap-1 text-sm">
        <div>我的个人资料</div>
        <Separator />
        <div className="flex flex-row gap-4 items-center p-1">
            <UserAvatar userInfo={userInfo} className="h-12 w-12 shadow-md" />
            <div className="flex flex-col gap-1 italic text-gray-500">
                <div>{userInfo?.account}</div>
                <Input defaultValue={userInfo?.name} />
            </div>
        </div>
        <div>账号安全</div>
        <Separator />
        <div className="flex justify-between items-center p-1 text-sm text-gray-500">
            <div>
                邮件地址
                <div>
                    {userInfo?.email}
                </div>
            </div>
            <Button size="sm" variant="ghost">更改邮箱地址</Button>
        </div>
        <div className="flex justify-between items-center p-1 text-sm text-gray-500">
            <div>
                密码
            </div>
            <Button size="sm" variant="ghost">更改密码</Button>
        </div>
        <div className="flex justify-between items-center p-1 text-sm font-thin text-gray-500">
            <div >
                <div className="text-red-500">删除我的账号</div>
                <div className="text-xs">永久删除帐号并删除所有工作空间的访问权限</div>
            </div>
            <Button size="sm" variant="destructive">删除</Button>
        </div>
    </div>
}