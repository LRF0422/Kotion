import { CollaborationEditor, EditorRender } from "@kn/editor";
import { BellDotIcon, CheckCircle2, DownloadCloudIcon, Settings } from "@kn/icon";
import { Badge, Button, Empty, Rate, Separator, Tabs, TabsContent, TabsList, TabsTrigger } from "@kn/ui";
import React from "react";


export const PluginDetail: React.FC = () => {

    return <div className=" justify-center h-[100vh]">
        <div className="flex gap-10 items-center justify-center shadow-sm border-b pb-2 pt-2">
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

        <div className=" bg-muted/60 flex justify-center  h-[calc(100vh-150px)]">
            <Tabs className="mt-5 " defaultValue="Feature">
                <TabsList>
                    <TabsTrigger value="Feature">Feature</TabsTrigger>
                    <TabsTrigger value="Detail">Detail</TabsTrigger>
                    <TabsTrigger value="ChangeLog">ChangeLog</TabsTrigger>
                </TabsList>
                <TabsContent value="Feature" className=" overflow-auto border rounded-sm ">
                    <CollaborationEditor
                        user={null}
                        token=""
                        id="Feature"
                        toc={false}
                        toolbar={false}
                        isEditable
                        width="w-[90%]"
                        className="rounded-sm prose-sm h-[calc(100vh-300px)]"
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