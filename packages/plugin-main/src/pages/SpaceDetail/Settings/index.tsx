import { APIS } from "../../../api";
import { Tabs, TabsContent, TabsList, TabsTrigger, Skeleton, Card, CardContent } from "@kn/ui";
import { useApi } from "@kn/core";
import { Space } from "../../../model/Space";
import { useSafeState } from "@kn/core";
import React, { createContext, useEffect } from "react";
import { useParams } from "@kn/common";
import { Basic } from "./Basic";
import { Archive } from "./Archive";
import { Delete } from "./Delete";
import { Settings, Shield, Users, Archive as ArchiveIcon, Trash2, FileText } from "@kn/icon";
import { useTranslation } from "@kn/common";

export const SettingContext = createContext<{ space?: Space }>({})


export const SpaceSettings: React.FC = () => {

    const [space, setSpace] = useSafeState<any>()
    const [loading, setLoading] = useSafeState(true)
    const params = useParams()
    const { t } = useTranslation()

    useEffect(() => {
        setLoading(true)
        useApi(APIS.SPACE_DETAIL, { id: params.id })
            .then((res: any) => {
                setSpace(res.data)
            })
            .finally(() => {
                setLoading(false)
            })
    }, [params.id])

    if (loading) {
        return <div className="h-screen bg-background">
            <header className="px-8 py-6 border-b bg-card">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-4 w-96 mt-2" />
            </header>
            <main className="p-8">
                <Card>
                    <CardContent className="p-8">
                        <div className="space-y-4">
                            <Skeleton className="h-10 w-full" />
                            <Skeleton className="h-64 w-full" />
                        </div>
                    </CardContent>
                </Card>
            </main>
        </div>
    }

    return space && <SettingContext.Provider value={{ space: space }}>
        <div className="h-screen flex flex-col bg-background">
            <header className="px-8 py-6 border-b bg-card shadow-sm">
                <div className="flex items-center gap-3 mb-2">
                    <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
                        <Settings className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">{t("space-settings.title")}</h1>
                        <p className="text-sm text-muted-foreground mt-1">{t("space-settings.subtitle", { name: space?.name })}</p>
                    </div>
                </div>
            </header>
            <main className="flex-1 overflow-auto p-8">
                <Card className="max-w-6xl mx-auto border-none">
                    <CardContent className="p-8">
                        <Tabs defaultValue="basic" className="space-y-6">
                            <TabsList className="grid w-full grid-cols-5 h-auto p-1">
                                <TabsTrigger value="basic" className="flex items-center gap-2 py-3">
                                    <FileText className="h-4 w-4" />
                                    <span className="hidden sm:inline">{t("space-settings.basic.tab")}</span>
                                </TabsTrigger>
                                <TabsTrigger value="page" className="flex items-center gap-2 py-3">
                                    <Shield className="h-4 w-4" />
                                    <span className="hidden sm:inline">{t("space-settings.page.tab")}</span>
                                </TabsTrigger>
                                <TabsTrigger value="member" className="flex items-center gap-2 py-3">
                                    <Users className="h-4 w-4" />
                                    <span className="hidden sm:inline">{t("space-settings.member.tab")}</span>
                                </TabsTrigger>
                                <TabsTrigger value="archive" className="flex items-center gap-2 py-3">
                                    <ArchiveIcon className="h-4 w-4" />
                                    <span className="hidden sm:inline">{t("space-settings.archive.tab")}</span>
                                </TabsTrigger>
                                <TabsTrigger value="delete" className="flex items-center gap-2 py-3">
                                    <Trash2 className="h-4 w-4" />
                                    <span className="hidden sm:inline">{t("space-settings.delete.tab")}</span>
                                </TabsTrigger>
                            </TabsList>
                            <TabsContent value="basic" className="mt-6 space-y-6">
                                <Basic />
                            </TabsContent>
                            <TabsContent value="page" className="mt-6">
                                <div className="flex flex-col items-center justify-center py-16 text-center">
                                    <Shield className="h-16 w-16 text-muted-foreground/50 mb-4" />
                                    <h3 className="text-lg font-semibold mb-2">{t("space-settings.page.title")}</h3>
                                    <p className="text-sm text-muted-foreground max-w-md">{t("space-settings.page.description")}</p>
                                </div>
                            </TabsContent>
                            <TabsContent value="member" className="mt-6">
                                <div className="flex flex-col items-center justify-center py-16 text-center">
                                    <Users className="h-16 w-16 text-muted-foreground/50 mb-4" />
                                    <h3 className="text-lg font-semibold mb-2">{t("space-settings.member.title")}</h3>
                                    <p className="text-sm text-muted-foreground max-w-md">{t("space-settings.member.description")}</p>
                                </div>
                            </TabsContent>
                            <TabsContent value="archive" className="mt-6">
                                <Archive />
                            </TabsContent>
                            <TabsContent value="delete" className="mt-6">
                                <Delete />
                            </TabsContent>
                        </Tabs>
                    </CardContent>
                </Card>
            </main>
        </div>
    </SettingContext.Provider>
}