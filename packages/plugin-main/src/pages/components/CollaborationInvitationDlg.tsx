import { APIS } from "../../api";
import { Badge } from "@kn/ui";
import { Button } from "@kn/ui";
import { Popover, PopoverContent, PopoverTrigger } from "@kn/ui";
import { Select } from "@kn/ui";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@kn/ui";
import { Tag, TagInput } from "@kn/ui";
import { useApi } from "@kn/core";
import { useSafeState } from "@kn/core";
import { Check, Mail, User, X } from "@kn/icon";
import React, { PropsWithChildren, useState } from "react";
import { useParams } from "@kn/core";
import { toast } from "@kn/ui";

export const CollaborationInvitationDlg: React.FC<PropsWithChildren> = (props) => {

    const [selectedUsers, setSelectedUsers] = useSafeState([
        {
            name: 'test'
        },
        {
            name: 'tsest2'
        }
    ])

    const [users, setUsers] = useSafeState([
        {
            name: 'test'
        },
        {
            name: 'tsest2'
        }
    ])
    const [emails, setEmails] = useSafeState<Tag[]>([])
    const [activeTagIndex, setActiveTagIndex] = useState<number | null>(null);
    const params = useParams()

    const handleClick = (user: any) => {
        if (selectedUsers.map(it => it.name).includes(user.name)) {
            setSelectedUsers(pre => pre.filter(it => it.name !== user.name))
        } else {
            setSelectedUsers(pre => [...pre, user])
        }
    }

    const handleRemove = (user: any) => {
        setSelectedUsers(pre => pre.filter(it => it.name !== user.name))

    }

    const handleInviteByEmail = () => {
        const param = {
            spaceId: params.id,
            pageId: params.pageId,
            collaboratorEmails: emails.map(it => it.text),
            permissions: ["READ", "WRITE"]
        }
        useApi(APIS.CREATE_INVITATION, null, param).then(() => {
            toast.success("邀请发送成功");
        })
    }

    return <Popover>
        <PopoverTrigger>{props.children}</PopoverTrigger>
        <PopoverContent className="p-2 w-[500px] flex flex-col gap-2">
            <div className=" font-bold">邀请加入编辑</div>
            <Tabs defaultValue="inner">
                <TabsList>
                    <TabsTrigger value="inner"><User className="h-3 w-3 mr-1" /> 邀请人员 </TabsTrigger>
                    <TabsTrigger value="email"><Mail className="h-3 w-3 mr-1" />通过邮件邀请</TabsTrigger>
                </TabsList>
                <TabsContent value="inner">
                    <div className="flex items-center gap-1">
                        <Button className="flex w-full p-1 cursor-auto rounded-md border min-h-9 h-auto items-center justify-start bg-inherit hover:bg-inherit gap-1">
                            {
                                selectedUsers.map((user, index) => (
                                    <Badge key={index} className="flex items-center gap-1">
                                        <div>{user.name}</div>
                                        <X className="h-3 w-3" onClick={() => handleRemove(user)} />
                                    </Badge>
                                ))
                            }
                        </Button>
                        <Select></Select>
                        <Button>Invite</Button>
                    </div>
                    <div className="flex flex-col mt-1">
                        {
                            users.map((user, index) => (
                                <div className="w-full p-2 hover:bg-muted flex items-center gap-1 rounded-sm" key={index} onClick={() => handleClick(user)}>
                                    {selectedUsers.map(it => it.name).includes(user.name) && <Check className="h-3 w-3" strokeWidth={5} />}{user.name}
                                </div>
                            ))
                        }
                    </div>
                </TabsContent>
                <TabsContent value="email">
                    <div className="flex flex-col gap-1">
                        <TagInput
                            tags={emails}
                            setTags={(newValues) => {
                                setEmails(newValues)
                            }}
                            activeTagIndex={activeTagIndex}
                            setActiveTagIndex={(index) => {
                                setActiveTagIndex(index)
                            }}
                        />
                        <Button className="w-[80px]" onClick={handleInviteByEmail}>Invite</Button>
                    </div>
                </TabsContent>
            </Tabs>
        </PopoverContent>
    </Popover>
}