import { APIS } from "../../../api";
import { Tabs, TabsContent, TabsList, TabsTrigger, Skeleton, Card, CardContent } from "@kn/ui";
import { useApi } from "@kn/common";
import { Space } from "../../../model/Space";
import { useSafeState } from "@kn/common";
import React, { createContext, useEffect } from "react";
import { useParams } from "@kn/common";
import { Basic } from "./Basic";
import { Archive } from "./Archive";
import { Delete } from "./Delete";
import { PageManagement } from "./Page";
import { Members } from "./Members";
import { SpaceTemplateLibrary } from "../TemplateLibrary";
import { Settings, Shield, Users, Archive as ArchiveIcon, Trash2, FileText, LayoutTemplate } from "@kn/icon";
import { useTranslation } from "@kn/common";

export const SettingContext = createContext<{ space?: Space; spaceId?: string }>({})


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
            <header className="px-6 py-3 border-b bg-card">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-3 w-72 mt-1.5" />
            </header>
            <main className="p-5">
                <Card>
                    <CardContent className="p-5">
                        <div className="space-y-3">
                            <Skeleton className="h-8 w-full" />
                            <Skeleton className="h-48 w-full" />
                        </div>
                    </CardContent>
                </Card>
            </main>
        </div>
    }

    return space && <SettingContext.Provider value={{ space: space, spaceId: params.id }}>
        <div className="h-screen flex flex-col bg-background">
            <header className="px-6 py-3 border-b bg-card shadow-sm">
                <div className="flex items-center gap-2.5">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10">
                        <Settings className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-lg font-semibold text-foreground">{t("space-settings.title")}</h1>
                        <p className="text-xs text-muted-foreground">{t("space-settings.subtitle", { name: space?.name })}</p>
                    </div>
                </div>
            </header>
            <main className="flex-1 overflow-auto p-5">
                <Card className="max-w-6xl mx-auto border-none">
                    <CardContent className="p-5">
                        <Tabs defaultValue="basic" className="space-y-4">
                            <TabsList className="grid w-full grid-cols-6 h-auto p-0.5">
                                <TabsTrigger value="basic" className="flex items-center gap-1.5 py-2 text-xs">
                                    <FileText className="h-3.5 w-3.5" />
                                    <span className="hidden sm:inline">{t("space-settings.basic.tab")}</span>
                                </TabsTrigger>
                                <TabsTrigger value="page" className="flex items-center gap-1.5 py-2 text-xs">
                                    <Shield className="h-3.5 w-3.5" />
                                    <span className="hidden sm:inline">{t("space-settings.page.tab")}</span>
                                </TabsTrigger>
                                <TabsTrigger value="member" className="flex items-center gap-1.5 py-2 text-xs">
                                    <Users className="h-3.5 w-3.5" />
                                    <span className="hidden sm:inline">{t("space-settings.member.tab")}</span>
                                </TabsTrigger>
                                <TabsTrigger value="templates" className="flex items-center gap-1.5 py-2 text-xs">
                                    <LayoutTemplate className="h-3.5 w-3.5" />
                                    <span className="hidden sm:inline">{t("space-settings.templates.tab", "Templates")}</span>
                                </TabsTrigger>
                                <TabsTrigger value="archive" className="flex items-center gap-1.5 py-2 text-xs">
                                    <ArchiveIcon className="h-3.5 w-3.5" />
                                    <span className="hidden sm:inline">{t("space-settings.archive.tab")}</span>
                                </TabsTrigger>
                                <TabsTrigger value="delete" className="flex items-center gap-1.5 py-2 text-xs">
                                    <Trash2 className="h-3.5 w-3.5" />
                                    <span className="hidden sm:inline">{t("space-settings.delete.tab")}</span>
                                </TabsTrigger>
                            </TabsList>
                            <TabsContent value="basic" className="mt-4 space-y-4">
                                <Basic />
                            </TabsContent>
                            <TabsContent value="page" className="mt-4">
                                <PageManagement />
                            </TabsContent>
                            <TabsContent value="member" className="mt-4">
                                <Members />
                            </TabsContent>
                            <TabsContent value="templates" className="mt-4">
                                {params.id && <SpaceTemplateLibrary spaceId={params.id} />}
                            </TabsContent>
                            <TabsContent value="archive" className="mt-4">
                                <Archive />
                            </TabsContent>
                            <TabsContent value="delete" className="mt-4">
                                <Delete />
                            </TabsContent>
                        </Tabs>
                    </CardContent>
                </Card>
            </main>
        </div>
    </SettingContext.Provider>
}