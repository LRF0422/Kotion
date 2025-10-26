import { EditorRender } from "@kn/editor";
import { CheckCircle2, DownloadIcon, Settings } from "@kn/icon";
import { Avatar, Badge, Button, Rate, Separator, Tabs, TabsContent, TabsList, TabsTrigger } from "@kn/ui";
import { useSafeState } from "ahooks";
import React, { useEffect } from "react";
import { useParams } from "@kn/common";
import { useApi, useUploadFile } from "../../../hooks";
import { APIS } from "../../../api";


export const PluginDetail: React.FC = () => {

    const [pluginDetail, setPluginDetail] = useSafeState<any>()
    const params = useParams()
    const { usePath } = useUploadFile()

    useEffect(() => {
        if (params.id) {
            useApi(APIS.GET_PLUGIN, { id: params.id }).then(res => {
                setPluginDetail(res.data)
            })
        }
    }, [params.id])

    return pluginDetail && <div className=" flex flex-col h-[100vh]">
        <div className="flex gap-10 items-center justify-center shadow-sm border-b pb-4 pt-4 h-[250px]">
            <Avatar className="w-[80px] h-[80px]">
                <img src={usePath(pluginDetail?.icon)} alt="logo" />
            </Avatar>
            <div className=" grow-1 space-y-1">
                <div className="text-[30px] flex items-center gap-2">
                    <div>{pluginDetail?.name}</div>
                    <Badge variant="outline">V 0.0.1</Badge>
                </div>
                <div className="flex items-center gap-3 h-[30px]">
                    <div>
                        <Badge><CheckCircle2 className="h-4 w-4 mr-2" />{ pluginDetail.developer }</Badge>
                    </div>
                    <Separator orientation="vertical" className="" />
                    <div className="gap-1 flex items-center">
                        <DownloadIcon className="h-4 w-4 mr-2" />
                        { pluginDetail.downloads }
                    </div>
                    <Separator orientation="vertical" />
                    <div className="gap-1 flex">
                        <Rate rating={pluginDetail.rating} variant="yellow" disabled />
                    </div>
                </div>
                <div className="w-[600px] max-h-[100px] overflow-hidden"> {pluginDetail.description}</div>
                <div className="gap-1 flex items-center">
                    <Button className="text-[12px] py-0.1 h-5">Install</Button>
                    <Settings className="p-1 hover:bg-muted rounded-sm cursor-pointer" />
                </div>
            </div>
        </div>

        <div className=" bg-muted/60 flex justify-center flex-1 h-[calc(100%-200px)] overflow-auto">
            <Tabs className="mt-5 w-[800px] " defaultValue="Feature">
                <TabsList>
                    {
                        pluginDetail.currentVersion.versionDescription.map((it: any, index: number) => (
                            <TabsTrigger key={index} value={it.label}>{it.label}</TabsTrigger>
                        ))
                    }
                </TabsList>
                {
                    pluginDetail.currentVersion.versionDescription.map((it: any, index: number) => (
                        <TabsContent value={it.label} className=" overflow-auto border rounded-sm h-[calc(100%-200px)]">
                            <EditorRender
                                content={JSON.parse(it.content)}
                                user={null}
                                id="Feature"
                                toc={false}
                                toolbar={false}
                                isEditable={false}
                                width="w-full"
                                className="rounded-sm prose-sm "
                                withTitle={false} />
                        </TabsContent>
                    ))
                }
            </Tabs>
        </div>
    </div>
}