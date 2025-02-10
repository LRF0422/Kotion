import { BellDotIcon, DownloadCloudIcon, Settings, Star } from "@repo/icon";
import { Badge, Separator, Tabs, TabsList, TabsTrigger } from "@repo/ui";
import React from "react";


export const PluginDetail: React.FC = () => {
    return <div className="flex w-full justify-center h-screen bg-muted/60">
        <div className=" w-[80%]">
            <div className="flex gap-4 items-center justify-center mt-10">
                <BellDotIcon className="h-20 w-20" strokeWidth={0.6} />
                <div className=" grow-1 space-y-1">
                    <div className="text-[30px]">Push Notifications</div>
                    <div className="flex items-center gap-2">
                        <div>
                            <Badge>Knowledge</Badge>
                        </div>
                        <Separator orientation="vertical" />
                        <div className="gap-1 flex">
                            <DownloadCloudIcon />
                            100M
                        </div>
                        <Separator orientation="vertical" />
                        <div className="gap-1 flex">
                            <Star />
                            5.0
                        </div>
                    </div>
                    <div> Send notifications to device.</div>
                    <div className="gap-1 flex items-center">
                        <Badge className="text-[12px] py-0.1">Install</Badge>
                        <Settings className="h-4 w-4" />
                    </div>
                </div>
            </div>
            <Tabs className="mt-5 w-full">
                <TabsList>
                    <TabsTrigger value="Feature">Feature</TabsTrigger>
                    <TabsTrigger value="Detail">Detail</TabsTrigger>
                    <TabsTrigger value="ChangeLog">ChangeLog</TabsTrigger>
                </TabsList>
            </Tabs>
        </div>
    </div>
}