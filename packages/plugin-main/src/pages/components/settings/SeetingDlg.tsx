import { Avatar, AvatarFallback, AvatarImage } from "@kn/ui";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@kn/ui";
import { TreeView } from "@kn/ui";
import { TreeViewElement } from "@kn/ui";
import { Badge } from "@kn/ui";
import { ScrollArea } from "@kn/ui";
import { GlobalState, useUploadFile } from "@kn/core";
import { useSafeState } from "@kn/core";
import { UserCircle, Settings, Bell, Globe, ArrowUpCircle, UserCog, Group, Import } from "@kn/icon";
import React, { PropsWithChildren } from "react";
import { useSelector } from "@kn/common";
import { MyAccount } from "./components/MyAccount";
import { MySetting } from "./components/MySetting";
import { Member } from "./components/Member";

export const SettingDlg: React.FC<PropsWithChildren> = ({ children }) => {


    const { userInfo } = useSelector((state: GlobalState) => state)
    const [currentKey, setCurrentKey] = useSafeState<string>()
    const { usePath } = useUploadFile()

    const render = () => {
        switch (currentKey) {
            case 'MyAccount':
                return <MyAccount />
            case 'MySetting':
                return <MySetting />
            case 'Member':
                return <Member />
            default:
                return <MyAccount />
        }
        // if (currentKey) {
        //     // @ts-ignore
        //     const Component = React.lazy(moudles[`./compontents/${currentKey}.tsx`])
        //     return <Component />
        // }
        // return <></>
    }

    const settingItems: TreeViewElement[] = [
        {
            id: 'account',
            name: '账号',
            isGroup: true,
            children: [
                {
                    id: 'MyAccount',
                    name: "我的账号",
                    customerRender: <div className="flex items-center gap-3 p-2 mx-1 mb-1 rounded-md border border-border bg-card hover:bg-accent/50 transition-colors cursor-pointer">
                        <Avatar className="h-9 w-9 border-2 border-primary/20">
                            <AvatarImage src={usePath(userInfo?.avatar as string)} />
                            <AvatarFallback className="bg-primary/10 text-primary font-semibold">{userInfo?.account?.slice(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">{userInfo?.name}</div>
                            <div className="text-xs text-muted-foreground truncate">{userInfo?.account}</div>
                        </div>
                        <Badge variant="secondary" className="text-xs px-1.5 py-0 h-5">Free</Badge>
                    </div>
                },
                {
                    id: 'accounrDetail',
                    name: "我的账号",
                    icon: <UserCircle className="h-4 w-4" />,
                    onClick: () => {
                        setCurrentKey("MyAccount")
                    }
                },
                {
                    id: 'settings',
                    name: "我的设置",
                    icon: <Settings className="h-4 w-4" />,
                    onClick: () => {
                        setCurrentKey("MySetting")
                    }
                },
                {
                    id: 'notifaction',
                    name: "我的通知",
                    icon: <Bell className="h-4 w-4" />
                },
                {
                    id: 'language',
                    name: "我的语言",
                    icon: <Globe className="h-4 w-4" />
                }
            ]
        },
        {
            id: 'workspaces',
            name: '工作空间',
            isGroup: true,
            children: [
                {
                    id: 'upgrade',
                    name: '升级方案',
                    icon: <ArrowUpCircle className="h-4 w-4" />,
                    className: 'text-primary font-medium hover:text-primary'
                },
                {
                    id: 'member',
                    name: '人员设置',
                    icon: <UserCog className="h-4 w-4" />,
                    onClick: () => {
                        setCurrentKey("Member")
                    }
                },
                {
                    id: 'spaces',
                    name: "空间设置",
                    icon: <Group className="h-4 w-4" />
                },
                {
                    id: 'import',
                    name: '导入',
                    icon: <Import className="h-4 w-4" />
                }
            ]
        }
    ]

    return <Dialog>
        <DialogTrigger asChild>
            {children}
        </DialogTrigger>
        <DialogContent className="p-0 max-w-[1000px] h-[700px] gap-0">
            <DialogHeader className="px-6 py-4 border-b">
                <DialogTitle className="text-lg font-semibold">设置</DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground">管理您的账号和工作空间设置</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-[260px_1fr] h-[calc(100%-73px)]">
                <ScrollArea className="border-r">
                    <div className="p-3">
                        <TreeView
                            size="sm"
                            elements={settingItems}
                        />
                    </div>
                </ScrollArea>
                <ScrollArea className="h-full">
                    <div className="p-8">
                        {
                            render()
                        }
                    </div>
                </ScrollArea>
            </div>
        </DialogContent>
    </Dialog>
}