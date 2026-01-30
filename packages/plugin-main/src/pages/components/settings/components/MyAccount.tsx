import { Separator } from "@kn/ui";
import { GlobalState } from "@kn/core";
import React from "react";
import { useSelector } from "@kn/common";
import { UserAvatar } from "../../UserAvatar";
import { Input } from "@kn/ui";
import { Button } from "@kn/ui";
import { Label } from "@kn/ui";
import { Card, CardContent } from "@kn/ui";

export const MyAccount: React.FC = () => {

    const { userInfo } = useSelector((state: GlobalState) => state)

    return <div className="flex flex-col gap-6">
        {/* Profile Section */}
        <div className="space-y-4">
            <div>
                <h3 className="text-base font-semibold">我的个人资料</h3>
                <p className="text-sm text-muted-foreground mt-1">管理您的个人信息</p>
            </div>
            <Separator />
            <Card>
                <CardContent className="p-6">
                    <div className="flex items-start gap-6">
                        <UserAvatar userInfo={userInfo} className="h-20 w-20 border-2 border-border" />
                        <div className="flex-1 space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="username" className="text-sm font-medium">用户名</Label>
                                <Input
                                    id="username"
                                    defaultValue={userInfo?.name}
                                    className="max-w-md"
                                    placeholder="输入您的用户名"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="account" className="text-sm font-medium">账号</Label>
                                <Input
                                    id="account"
                                    value={userInfo?.account}
                                    className="max-w-md"
                                    disabled
                                />
                            </div>
                            <Button size="sm" className="mt-2">保存更改</Button>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>

        {/* Security Section */}
        <div className="space-y-4">
            <div>
                <h3 className="text-base font-semibold">账号安全</h3>
                <p className="text-sm text-muted-foreground mt-1">管理您的账号安全设置</p>
            </div>
            <Separator />
            <Card>
                <CardContent className="p-0 divide-y">
                    <div className="flex justify-between items-center p-4 hover:bg-accent/50 transition-colors">
                        <div className="space-y-1">
                            <div className="text-sm font-medium">邮件地址</div>
                            <div className="text-sm text-muted-foreground">{userInfo?.email || '未设置邮箱'}</div>
                        </div>
                        <Button size="sm" variant="outline">更改邮箱</Button>
                    </div>
                    <div className="flex justify-between items-center p-4 hover:bg-accent/50 transition-colors">
                        <div className="space-y-1">
                            <div className="text-sm font-medium">密码</div>
                            <div className="text-sm text-muted-foreground">••••••••</div>
                        </div>
                        <Button size="sm" variant="outline">更改密码</Button>
                    </div>
                </CardContent>
            </Card>
        </div>

        {/* Danger Zone */}
        <div className="space-y-4">
            <div>
                <h3 className="text-base font-semibold text-destructive">危险区域</h3>
                <p className="text-sm text-muted-foreground mt-1">这些操作无法撤销，请谨慎操作</p>
            </div>
            <Separator />
            <Card className="border-destructive/50">
                <CardContent className="p-4">
                    <div className="flex justify-between items-start">
                        <div className="space-y-1">
                            <div className="text-sm font-medium text-destructive">删除我的账号</div>
                            <div className="text-xs text-muted-foreground max-w-md">
                                永久删除账号并删除所有工作空间的访问权限。此操作无法撤销。
                            </div>
                        </div>
                        <Button size="sm" variant="destructive">删除账号</Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    </div>
}