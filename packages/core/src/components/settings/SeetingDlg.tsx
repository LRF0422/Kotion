import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@repo/ui";
import { TreeView } from "@repo/ui";
import { TreeViewElement } from "@repo/ui";
import { GlobalState } from "../../store/GlobalState";
import { useSafeState } from "ahooks";
import { UserCircle, Settings, Bell, Globe, ArrowUpCircle, UserCog, Group, Import } from "@repo/icon";
import React, { PropsWithChildren } from "react";
import { useSelector } from "react-redux";
import { MyAccount } from "./components/MyAccount";
import { MySetting } from "./components/MySetting";
import { Member } from "./components/Member";

export const SettingDlg: React.FC<PropsWithChildren> = ({ children }) => {

    const { userInfo } = useSelector((state: GlobalState) => state)
    const [currentKey, setCurrentKey] = useSafeState<string>()

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
                    customerRender: <div className="flex items-center gap-3 bg-white p-1 rounded-sm border-secondary border">
                        <Avatar className="h-7 w-7 shadow-md">
                            <AvatarImage src={`http://www.simple-platform.cn:88/knowledge-resource/oss/endpoint/download?fileName=${userInfo?.avatar}`} />
                            <AvatarFallback>{userInfo?.account}</AvatarFallback>
                        </Avatar>
                        <div className=" text-gray-500 text-xs flex flex-col italic">
                            <div>{userInfo?.account}</div>
                            <div>{userInfo?.name}</div>
                        </div>
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
                    icon: <ArrowUpCircle className="h-4 w-4 " />,
                    className: 'text-blue-400'
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
        <DialogTrigger>
            {children}
        </DialogTrigger>
        <DialogContent className="p-0 max-w-[1000px]">
            <DialogHeader className="hidden">
                <DialogTitle></DialogTitle>
                <DialogDescription></DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-[220px_1fr] ">
                <div className=" bg-muted/40 min-h-[600px]">
                    <TreeView
                        size="sm"
                        elements={settingItems}
                    />
                </div>
                <div className="p-9">
                    {
                        render()
                    }
                </div>
            </div>
        </DialogContent>
    </Dialog>
}