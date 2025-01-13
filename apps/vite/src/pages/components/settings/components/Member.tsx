import { Button } from "@repo/ui";
import { Empty } from "@repo/ui";
import { Separator } from "@repo/ui";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui";
import { Copy, Plus } from "lucide-react";
import React from "react";

export const Member: React.FC = () => {
    return <div className="flex flex-col gap-2 text-sm text-gray-500">
        <div>人员设置</div>
        <div className="flex justify-between items-center">
            <div>
                <div>通过邀请链接添加成员</div>
                <div className=" text-xs italic">只有拥有邀请成员权限的人员才能查看此内容</div>
            </div>
            <Button size="sm"> <Copy className="h-4 w-4 mr-1" /> 拷贝链接</Button>
        </div>
        <Separator />
        <Tabs defaultValue="members">
            <div className="flex justify-between">
                <TabsList>
                    <TabsTrigger value="members">成员</TabsTrigger>
                    <TabsTrigger value="groups">群组</TabsTrigger>
                    <TabsTrigger value="guests">访客</TabsTrigger>
                </TabsList>
                <Button size="sm"><Plus className="h-4 w-4 mr-1" />邀请人员</Button>
            </div>
            <TabsContent value="members">
                <Empty />
            </TabsContent>
            <TabsContent value="groups">
                <Empty />
            </TabsContent>
            <TabsContent value="guests">
                <Empty />
            </TabsContent>
        </Tabs>
    </div>
}