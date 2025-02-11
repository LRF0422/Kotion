import { EditorRender } from "@repo/editor";
import { BellDotIcon, CheckCircle2, DownloadCloudIcon, Settings } from "@repo/icon";
import { Badge, Button, Empty, Rate, Separator, Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui";
import React from "react";


export const PluginDetail: React.FC = () => {

    return <div className="flex w-full justify-center h-screen bg-muted/60">
        <div className=" w-[80%]">
            <div className="flex gap-10 items-center justify-center mt-10">
                <BellDotIcon className="h-20 w-20" strokeWidth={0.8} />
                <div className=" grow-1 space-y-1">
                    <div className="text-[30px] flex items-center gap-2">
                        <div>Push Notifications</div>
                        <Badge variant="outline">V 0.0.1</Badge>
                    </div>
                    <div className="flex items-center gap-3 h-[30px]">
                        <div>
                            <Badge><CheckCircle2 className="h-4 w-4 mr-2" />Knowledge</Badge>
                        </div>
                        <Separator orientation="vertical" className="" />
                        <div className="gap-1 flex">
                            <DownloadCloudIcon />
                            100M
                        </div>
                        <Separator orientation="vertical" />
                        <div className="gap-1 flex">
                            <Rate rating={5} variant="yellow" disabled />
                        </div>
                    </div>
                    <div> Send notifications to device.</div>
                    <div className="gap-1 flex items-center">
                        <Button className="text-[12px] py-0.1 h-5">Install</Button>
                        <Settings className="p-1 hover:bg-muted rounded-sm cursor-pointer" />
                    </div>
                </div>
            </div>
            <Tabs className="mt-5 w-full" defaultValue="Feature">
                <TabsList>
                    <TabsTrigger value="Feature">Feature</TabsTrigger>
                    <TabsTrigger value="Detail">Detail</TabsTrigger>
                    <TabsTrigger value="ChangeLog">ChangeLog</TabsTrigger>
                </TabsList>
                <TabsContent value="Feature" className="h-[calc(100vh-300px)] overflow-auto border rounded-sm">
                    <EditorRender
                        id="Feature"
                        toc={false}
                        toolbar={false}
                        isEditable
                        className="w-full rounded-sm h-full prose-sm"
                        withTitle={false} />
                </TabsContent>
                <TabsContent value="Detail">
                    <Empty />
                </TabsContent>
                <TabsContent value="ChangeLog">
                    <Empty />
                </TabsContent>
            </Tabs>
        </div>
    </div>
}