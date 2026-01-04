import { ArchiveIcon, ArrowUpRight, BoxIcon, Dot, DownloadIcon, FilePlus2, Loader2, PlusIcon, RiNftFill, SearchIcon } from "@kn/icon";
import {
    Avatar, Button, Card, CardDescription, CardFooter, CardHeader, CardTitle, EmptyState, IconButton, Input,
    Rate,
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Separator, cn
} from "@kn/ui";
import React, { useContext, useEffect, useState } from "react";
import { PluginUploader } from "../PluginUploader";
import { useApi, useNavigator, useUploadFile } from "../../../hooks";
import { APIS } from "../../../api";
import { useToggle } from "ahooks";
import { AppContext, event, useTranslation } from "@kn/common";

export const Marketplace: React.FC = () => {

    const [categories, setCategories] = React.useState<string[]>([
        "All",
        "App",
        "Feature",
        "Connector"
    ])

    const [selectCategory, setSelectCategory] = useState<string>("All")
    const [plugins, setPlugins] = useState<any[]>([])
    const [installing, { toggle }] = useToggle(false)
    const [installingPluginId, setInstallingPluginId] = useState<string>()
    const { usePath } = useUploadFile()
    const navigator = useNavigator()
    const [flag, setFlag] = useState(0)
    const { t } = useTranslation()
    const { pluginManager } = useContext(AppContext)

    useEffect(() => {
        useApi(APIS.GET_PLUGIN_LIST, { pageSize: 10, category: selectCategory === "All" ? null : selectCategory.toLocaleUpperCase() }).then(res => {
            setPlugins(res.data.records)
        })
    }, [flag, selectCategory])

    useEffect(() => {
        event.on("REFRESH_PLUSINS", () => {
            setFlag(f => f + 1)
        })

        return () => {
            event.off("REFRESH_PLUSINS")
        }
    }, [])

    const installPlugin = (plugin: any) => {
        toggle()
        setInstallingPluginId(plugin.currentVersionId)
        useApi(APIS.INSTALL_PLUGIN, {
            versionId: plugin.currentVersionId
        }).then(() => {
            pluginManager?.installPlugin(plugin).then(() => {
                setInstallingPluginId(undefined)
                toggle()
            })
        })

    }

    return <div className="w-full">
        <div className=" flex justify-between items-start w-full px-2 py-3 border-b shadow-sm">
            <div>
                <Button size="sm" variant="secondary"><ArchiveIcon className="h-4 w-4 mr-1" />Installed Plugins</Button>
            </div>
            <div className="space-y-2">
                <Input placeholder="Search plugins" className="h-9 w-[500px] bg-muted" icon={<SearchIcon className="h-4 w-4" />} />
                <div className="flex gap-2 items-center justify-between w-full text-[16px]">
                    {
                        categories.map((it, index) => <div
                            onClick={() => setSelectCategory(it)}
                            className={cn("rounded-sm px-3 py-1 hover:bg-muted cursor-pointer transition-colors duration-75", selectCategory === it ? "bg-muted outline  " : "")}
                            key={index}>
                            {it}
                        </div>)
                    }
                </div>
            </div>
            <div className="flex gap-2 items-center">
                <Button size="sm" variant="secondary"><FilePlus2 className="h-4 w-4 mr-1" />Request a plugin</Button>
                <PluginUploader>
                    <Button size="sm"><PlusIcon className="h-4 w-4 mr-1" />Publish plugins</Button>
                </PluginUploader>
            </div>
        </div>
        <div className="bg-muted/40 w-full rounded-sm px-10  space-y-3 py-2 h-[calc(100vh-102px)] overflow-auto">
            <div className="w-full">
                <div className="text-[40px] font-bold font-serif">
                    {t("marketplace.title", "Enhance your Kotion experience")}
                </div>
                <div className="text-[30px] w-full text-ellipsis overflow-hidden font-serif">
                    {t("marketplace.description", "Discover plugins that extend Kotion's capabilities and help you work more efficiently.")}
                </div>
            </div>
            <div className="flex gap-2 items-center h-[30px] text-sm">
                <span>Result</span>
                <Separator orientation="vertical" />
                <Select>
                    <SelectTrigger className="w-[180px] h-8">
                        <div className=" mr-2">Sort by</div> <SelectValue placeholder="Theme" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="light">Light</SelectItem>
                        <SelectItem value="dark">Dark</SelectItem>
                        <SelectItem value="system">System</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            {
                plugins.length === 0 ? (
                    <EmptyState
                        className="h-[calc(100vh-160px)] hover:bg-background w-full max-w-none border-none flex flex-col justify-center"
                        title="No plugins found"
                        icons={[BoxIcon]}
                        description="Try searching for something else"
                    />
                ) : <div className=" grid xl:grid-cols-4 2xl:grid-cols-4 3xl:grid-clos-5 md:grid-cols-4  gap-2 w-full">
                    {
                        plugins.map((plugin, index) => (
                            <div key={index}>
                                <Card className="relative hover:bg-muted/30 ">
                                    <div className=" w-[80px] text-center absolute right-0 top-0 text-xs p-1  rounded-bl-md rounded-tr-md bg-secondary">
                                        {plugin?.category?.value}
                                    </div>
                                    <CardHeader>
                                        <CardTitle className=" text-sm">
                                            <div className="flex items-center gap-2">
                                                <Avatar className=" rounded-sm w-[60px] h-[60px]">
                                                    <img src={usePath(plugin.icon)} alt="logo" />
                                                </Avatar>
                                                <div className="flex flex-col gap-1">
                                                    {plugin.name}
                                                    <div className="text-xs text-gray-400 space-x-1">
                                                        <span>{plugin.developer}</span>
                                                        <span>/</span>
                                                        <span>{plugin.maintainer}</span>
                                                    </div>
                                                    <div className=" flex items-center text-gray-500 italic">
                                                        <Rate rating={plugin.rating} variant="yellow" disabled size={15} />
                                                        <Dot />
                                                        <div className="text-xs flex items-center gap-1">
                                                            <DownloadIcon className="h-3 w-3" /> {plugin.downloads}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </CardTitle>
                                        <CardDescription className="h-[80px] text-wrap overflow-hidden text-ellipsis">
                                            {plugin.description}
                                        </CardDescription>
                                    </CardHeader>
                                    <CardFooter className="pb-3 space-x-1">
                                        <IconButton
                                            disabled={!!(plugin.installeddVersions.length > 0)}
                                            className="px-2 border"
                                            onClick={() => installPlugin(plugin)}
                                            icon={(installing && installingPluginId === plugin.currentVersionId) ? <Loader2 className="w-4 h-4 animate-spin" /> : <div className="flex items-center gap-1 text-sm">
                                                <DownloadIcon className="w-4 h-4" />
                                                {plugin.installeddVersions.length > 0 ? "Installed" : "Install"}
                                            </div>} />
                                        <IconButton className="px-2 border" icon={<div className="flex items-center gap-1 text-sm" onClick={() => {
                                            navigator.go({
                                                to: `/plugin-hub/${plugin.id}`
                                            })
                                        }}>
                                            <ArrowUpRight className="w-4 h-4" />
                                            Details
                                        </div>} />
                                    </CardFooter>
                                </Card>
                            </div>
                        ))
                    }
                </div>
            }
            <div className="w-full">
                <div className="flex justify-center items-center w-full p-10 gap-3 bg-muted/70 border rounded-md mt-[30px] mb-[30px]    ">
                    <div>
                        <div className=" text-[30px] font-bold">{t("marketplace.create-your-own-plugin")}</div>
                        <div>Create plugins for Kotion and reach thousands of users worldwide.</div>
                    </div>
                    <div className="flex items-center justify-center gap-3">
                        <Button>{t("marketplace.get-started")}</Button>
                        <Button variant="secondary">{t("marketplace.doc")}</Button>
                    </div>
                </div>
            </div>
        </div>
    </div>
}