import { APIS } from "../../../api";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui";
import { useApi } from "@repo/core";
import { Space } from "../../../model/Space";
import { useSafeState } from "@repo/core";
import React, { createContext, useEffect } from "react";
import { useParams } from "@repo/core";
import { Basic } from "./Basic";
import { Archive } from "./Archive";
import { Delete } from "./Delete";

export const SettingContext = createContext<{ space?: Space }>({})


export const SpaceSettings: React.FC = () => {

    const [space, setSpace] = useSafeState<any>()
    const params = useParams()


    useEffect(() => {
        useApi(APIS.SPACE_DETAIL, { id: params.id }).then((res: any) => {
            setSpace(res.data)
        })
    }, [])

    return space && <SettingContext.Provider value={{ space: space }}>
        <div>
            <header className=" p-2 border-b shadow-sm font-bold">
                设置
            </header>
            <main className="p-10">
                <div className="p-2 rounded-sm flex flex-col gap-2 h-[calc(100vh-130px)]">
                    {space?.name}
                    <Tabs defaultValue="basic">
                        <TabsList>
                            <TabsTrigger value="basic">基本设置</TabsTrigger>
                            <TabsTrigger value="page">页面设置</TabsTrigger>
                            <TabsTrigger value="member">人员设置</TabsTrigger>
                            <TabsTrigger value="archive">归档</TabsTrigger>
                            <TabsTrigger value="delete">删除</TabsTrigger>
                        </TabsList>
                        <TabsContent value="basic" className=" h-[calc(100vh-200px)] rounded-sm border py-4 px-10">
                            <Basic />
                        </TabsContent>
                        <TabsContent value="page" className=" h-[calc(100vh-200px)] rounded-sm border py-4 px-10">

                        </TabsContent>
                        <TabsContent value="member" className=" h-[calc(100vh-200px)] rounded-sm border py-4 px-10">

                        </TabsContent>
                        <TabsContent value="archive" className=" h-[calc(100vh-200px)] rounded-sm border py-4 px-10">
                            <Archive />
                        </TabsContent>
                        <TabsContent value="delete" className=" h-[calc(100vh-200px)] rounded-sm border py-4 px-10">
                            <Delete />
                        </TabsContent>
                    </Tabs>
                </div>
            </main>
        </div>
    </SettingContext.Provider>
}