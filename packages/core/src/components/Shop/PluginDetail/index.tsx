import { EditorRender } from "@kn/editor";
import { ArrowLeft, CheckCircle2, DownloadIcon, ExternalLink, Globe, Settings } from "@kn/icon";
import { Avatar, Badge, Button, Rate, Separator, Tabs, TabsContent, TabsList, TabsTrigger } from "@kn/ui";
import { useSafeState } from "ahooks";
import React, { useEffect } from "react";
import { useParams } from "@kn/common";
import { useApi, useNavigator, useUploadFile } from "../../../hooks";
import { APIS } from "../../../api";


export const PluginDetail: React.FC = () => {

    const [pluginDetail, setPluginDetail] = useSafeState<any>()
    const params = useParams()
    const { usePath } = useUploadFile()
    const navigator = useNavigator()

    useEffect(() => {
        if (params.id) {
            useApi(APIS.GET_PLUGIN, { id: params.id }).then(res => {
                setPluginDetail(res.data)
            })
        }
    }, [params.id])

    return pluginDetail && <div className="w-full h-screen flex flex-col bg-background">
        {/* Simple Header Bar */}
        <div className="border-b bg-background">
            <div className="max-w-[1400px] mx-auto px-6 py-3">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigator.go({ to: '/plugin-hub' })}
                    className="hover:bg-muted"
                >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Extensions
                </Button>
            </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-auto">
            <div className="max-w-[1400px] mx-auto">
                {/* Plugin Header */}
                <div className="px-6 py-8 bg-muted/30 border-b">
                    <div className="flex gap-6 items-start">
                        {/* Plugin Icon */}
                        <Avatar className="w-32 h-32 rounded-lg shrink-0 shadow-sm">
                            <img src={usePath(pluginDetail?.icon)} alt={pluginDetail?.name} className="object-cover" />
                        </Avatar>

                        {/* Plugin Info */}
                        <div className="flex-1 min-w-0">
                            <div className="space-y-4">
                                {/* Title */}
                                <h1 className="text-3xl font-bold">{pluginDetail?.name}</h1>

                                {/* Meta Row */}
                                <div className="flex items-center gap-4 text-sm flex-wrap">
                                    <a href="#" className="flex items-center gap-1.5 hover:underline text-foreground">
                                        <CheckCircle2 className="h-4 w-4 text-blue-500" />
                                        <span className="font-medium">{pluginDetail.developer}</span>
                                    </a>
                                    <span className="text-muted-foreground">•</span>
                                    <div className="flex items-center gap-1.5">
                                        <DownloadIcon className="h-4 w-4" />
                                        <span className="font-medium">{pluginDetail.downloads?.toLocaleString()} installs</span>
                                    </div>
                                    <span className="text-muted-foreground">•</span>
                                    <div className="flex items-center gap-2">
                                        <Rate rating={pluginDetail.rating} variant="yellow" disabled size={14} />
                                        <span className="font-medium">({pluginDetail.reviews || 0})</span>
                                    </div>
                                    <span className="text-muted-foreground">•</span>
                                    <Badge variant="secondary" className="text-xs">{pluginDetail?.category?.value}</Badge>
                                </div>

                                {/* Description */}
                                <p className="text-base text-foreground leading-relaxed">
                                    {pluginDetail.description}
                                </p>

                                {/* Action Buttons */}
                                <div className="flex items-center gap-2 pt-2">
                                    <Button
                                        size="default"
                                        className="font-semibold"
                                        disabled={pluginDetail.installeddVersions?.length > 0}
                                    >
                                        {pluginDetail.installeddVersions?.length > 0 ? 'Installed' : 'Install'}
                                    </Button>
                                    <Button size="default" variant="outline">
                                        <Settings className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Content Layout: Tabs on Left, Info on Right */}
                <div className="grid grid-cols-3 gap-0">
                    {/* Main Content Area with Tabs */}
                    <div className="border-r col-span-2">
                        <Tabs className="w-full" defaultValue={pluginDetail.currentVersion?.versionDescription?.[0]?.label || "Overview"}>
                            {/* Tabs Navigation */}
                            <div className="border-b bg-background">
                                <div className="px-6">
                                    <TabsList className="bg-transparent h-auto p-0 border-none">
                                        {
                                            pluginDetail.currentVersion?.versionDescription?.map((it: any, index: number) => (
                                                <TabsTrigger
                                                    key={index}
                                                    value={it.label}
                                                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3 font-medium text-sm data-[state=active]:text-foreground text-muted-foreground hover:text-foreground transition-colors"
                                                >
                                                    {it.label}
                                                </TabsTrigger>
                                            ))
                                        }
                                    </TabsList>
                                </div>
                            </div>

                            {/* Tab Content */}
                            <div className="px-6 py-6">
                                {
                                    pluginDetail.currentVersion?.versionDescription?.map((it: any, index: number) => (
                                        <TabsContent
                                            key={index}
                                            value={it.label}
                                            className="m-0 min-h-[600px] animate-in fade-in-50 duration-300"
                                        >
                                            <EditorRender
                                                content={JSON.parse(it.content)}
                                                user={null}
                                                id={`plugin-detail-${index}`}
                                                toc={false}
                                                toolbar={false}
                                                isEditable={false}
                                                width="w-full"
                                                className="prose max-w-none"
                                                withTitle={false}
                                            />
                                        </TabsContent>
                                    ))
                                }
                            </div>
                        </Tabs>
                    </div>

                    {/* Fixed Right Sidebar - Plugin Info */}
                    <div className="px-6 py-6 bg-muted/20 col-span-1">
                        <div className="sticky top-6 space-y-6">
                            {/* Categories */}
                            <div className="space-y-3">
                                <h3 className="text-sm font-semibold">Categories</h3>
                                <div className="flex flex-wrap gap-2">
                                    <Badge variant="secondary" className="text-xs">
                                        {pluginDetail?.category?.value}
                                    </Badge>
                                </div>
                            </div>

                            <Separator />

                            {/* More Info */}
                            <div className="space-y-3">
                                <h3 className="text-sm font-semibold">More Info</h3>
                                <div className="space-y-2 text-sm">
                                    <div className="flex items-center justify-between py-1">
                                        <span className="text-muted-foreground">Version</span>
                                        <span className="font-medium">{pluginDetail?.currentVersion?.version || '0.0.1'}</span>
                                    </div>
                                    <div className="flex items-center justify-between py-1">
                                        <span className="text-muted-foreground">Developer</span>
                                        <span className="font-medium">{pluginDetail?.developer}</span>
                                    </div>
                                    <div className="flex items-center justify-between py-1">
                                        <span className="text-muted-foreground">Maintainer</span>
                                        <span className="font-medium truncate ml-2">{pluginDetail?.maintainer}</span>
                                    </div>
                                </div>
                            </div>

                            <Separator />

                            {/* Statistics */}
                            <div className="space-y-3">
                                <h3 className="text-sm font-semibold">Statistics</h3>
                                <div className="space-y-2 text-sm">
                                    <div className="flex items-center justify-between py-1">
                                        <span className="text-muted-foreground">Rating</span>
                                        <div className="flex items-center gap-1">
                                            <Rate rating={pluginDetail?.rating} variant="yellow" disabled size={14} />
                                            <span className="font-medium text-xs">({pluginDetail?.reviews || 0})</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between py-1">
                                        <span className="text-muted-foreground">Downloads</span>
                                        <span className="font-medium">{pluginDetail?.downloads?.toLocaleString()}</span>
                                    </div>
                                </div>
                            </div>

                            <Separator />

                            {/* Resources */}
                            <div className="space-y-3">
                                <h3 className="text-sm font-semibold">Resources</h3>
                                <div className="space-y-1">
                                    <a href="#" className="flex items-center gap-2 text-sm text-primary hover:underline py-1">
                                        <ExternalLink className="h-3.5 w-3.5" />
                                        Repository
                                    </a>
                                    <a href="#" className="flex items-center gap-2 text-sm text-primary hover:underline py-1">
                                        <Globe className="h-3.5 w-3.5" />
                                        Homepage
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
}