import { EditorRender } from "@kn/editor";
import { ArrowLeft, CheckCircle2, DownloadIcon, ExternalLink, Globe, Loader2, Settings } from "@kn/icon";
import { Avatar, Badge, Button, Rate, Separator, Tabs, TabsContent, TabsList, TabsTrigger, cn } from "@kn/ui";
import { useSafeState, useToggle } from "ahooks";
import React, { useContext, useEffect } from "react";
import { useParams } from "@kn/common";
import { AppContext, useApi, useNavigator, usePluginState, useUploadFile, PLUGIN_CHANGED, event } from "@kn/common";
import { APIS } from "@kn/common";


export const PluginDetail: React.FC = () => {

    const [pluginDetail, setPluginDetail] = useSafeState<any>()
    const params = useParams()
    const { usePath } = useUploadFile()
    const navigator = useNavigator()
    const { pluginManager } = useContext(AppContext)
    const { loadedPluginNames } = usePluginState()
    const [installing, { toggle: toggleInstalling }] = useToggle(false)

    useEffect(() => {
        if (params.id) {
            useApi(APIS.GET_PLUGIN, { id: params.id }).then(res => {
                setPluginDetail(res.data)
            })
        }
    }, [params.id])

    if (!pluginDetail) return null

    const installed = pluginDetail.installeddVersions?.length > 0
    const active = installed && loadedPluginNames.has(pluginDetail.name)
    const versionId = pluginDetail.currentVersionId ?? pluginDetail.currentVersion?.id

    const handleInstall = () => {
        if (!versionId || installed) return
        toggleInstalling()
        useApi(APIS.INSTALL_PLUGIN, { versionId }).then(() => {
            pluginManager?.installPlugin(pluginDetail).then(() => {
                toggleInstalling()
                event.emit(PLUGIN_CHANGED, { source: 'install' })
            })
        })
    }

    const tabs = pluginDetail.currentVersion?.versionDescription ?? []

    return (
        <div className="w-full h-screen flex flex-col bg-background">
            {/* Header bar */}
            <div className="border-b bg-background shrink-0">
                <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-3">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigator.go({ to: '/plugin-hub' })}
                    >
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Extensions
                    </Button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto">
                <div className="max-w-[1400px] mx-auto">
                    {/* Plugin header */}
                    <div className="px-4 sm:px-6 py-6 sm:py-8 bg-muted/30 border-b">
                        <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 items-start">
                            <Avatar className="w-24 h-24 sm:w-32 sm:h-32 rounded-lg shrink-0">
                                <img src={usePath(pluginDetail?.icon)} alt={pluginDetail?.name} className="object-cover" />
                            </Avatar>

                            <div className="flex-1 min-w-0 space-y-4">
                                <h1 className="text-2xl sm:text-3xl font-bold">{pluginDetail?.name}</h1>

                                <div className="flex items-center gap-3 sm:gap-4 text-sm flex-wrap">
                                    <span className="flex items-center gap-1.5 text-foreground">
                                        <CheckCircle2 className="h-4 w-4 text-blue-500" />
                                        <span className="font-medium">{pluginDetail.developer}</span>
                                    </span>
                                    <span className="text-muted-foreground">•</span>
                                    <div className="flex items-center gap-1.5">
                                        <DownloadIcon className="h-4 w-4" />
                                        <span className="font-medium">{(pluginDetail.downloads ?? 0).toLocaleString()} installs</span>
                                    </div>
                                    <span className="text-muted-foreground">•</span>
                                    <div className="flex items-center gap-2">
                                        <Rate rating={pluginDetail.rating} variant="yellow" disabled size={14} />
                                        <span className="font-medium">({pluginDetail.reviews || 0})</span>
                                    </div>
                                    {pluginDetail?.category?.value && (
                                        <>
                                            <span className="text-muted-foreground">•</span>
                                            <Badge variant="secondary" className="text-xs">{pluginDetail.category.value}</Badge>
                                        </>
                                    )}
                                </div>

                                <p className="text-base text-foreground leading-relaxed">
                                    {pluginDetail.description}
                                </p>

                                <div className="flex items-center gap-2 pt-2">
                                    <Button
                                        size="default"
                                        className={cn(
                                            "font-semibold w-full sm:w-auto h-11 sm:h-10",
                                            active && "bg-green-600 hover:bg-green-700 text-white"
                                        )}
                                        disabled={installed || installing}
                                        onClick={handleInstall}
                                    >
                                        {installing ? (
                                            <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                                        ) : installed ? (
                                            <CheckCircle2 className="h-4 w-4 mr-1.5" />
                                        ) : (
                                            <DownloadIcon className="h-4 w-4 mr-1.5" />
                                        )}
                                        {installed ? (active ? 'Active' : 'Installed') : 'Install'}
                                    </Button>
                                    <Button size="default" variant="outline" className="h-11 sm:h-10 shrink-0">
                                        <Settings className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Tabs + info */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-0">
                        {/* Main content */}
                        <div className="lg:border-r lg:col-span-2 min-w-0">
                            <Tabs className="w-full" defaultValue={tabs[0]?.label || "Overview"}>
                                <div className="border-b bg-background">
                                    <div className="px-4 sm:px-6 overflow-x-auto">
                                        <TabsList className="bg-transparent h-auto p-0 border-none">
                                            {tabs.map((it: any, index: number) => (
                                                <TabsTrigger
                                                    key={index}
                                                    value={it.label}
                                                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3 font-medium text-sm data-[state=active]:text-foreground text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
                                                >
                                                    {it.label}
                                                </TabsTrigger>
                                            ))}
                                        </TabsList>
                                    </div>
                                </div>

                                <div className="px-4 sm:px-6 py-6">
                                    {tabs.map((it: any, index: number) => (
                                        <TabsContent
                                            key={index}
                                            value={it.label}
                                            className="m-0 min-h-[400px] lg:min-h-[600px]"
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
                                    ))}
                                </div>
                            </Tabs>
                        </div>

                        {/* Info sidebar */}
                        <div className="px-4 sm:px-6 py-6 bg-muted/20 lg:col-span-1">
                            <div className="lg:sticky lg:top-6 space-y-6">
                                <div className="space-y-3">
                                    <h3 className="text-sm font-semibold">Categories</h3>
                                    <div className="flex flex-wrap gap-2">
                                        <Badge variant="secondary" className="text-xs">
                                            {pluginDetail?.category?.value}
                                        </Badge>
                                    </div>
                                </div>

                                <Separator />

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
                                        <div className="flex items-center justify-between py-1 gap-2">
                                            <span className="text-muted-foreground">Maintainer</span>
                                            <span className="font-medium truncate">{pluginDetail?.maintainer}</span>
                                        </div>
                                    </div>
                                </div>

                                <Separator />

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
                                            <span className="font-medium">{(pluginDetail?.downloads ?? 0).toLocaleString()}</span>
                                        </div>
                                    </div>
                                </div>

                                <Separator />

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
    )
}
