import { BoxSelect, DownloadCloud, PlusSquare, RefreshCcw, Slack, Star, Trash2 } from "@kn/icon";
import {
    Accordion, AccordionContent,
    AccordionItem, AccordionTrigger,
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
    Avatar,
    Badge, Button, EmptyState, Input, Separator, Tooltip,
    TooltipContent, TooltipProvider, TooltipTrigger
} from "@kn/ui";
import React, { useEffect, useState } from "react";
import { useNavigator } from "../../hooks/use-navigator";
import { Outlet } from "react-router-dom";
import { PluginUploader } from "./PluginUploader";
import { PluginManager } from "./PluginManager";
import { useApi, useUploadFile } from "../../hooks";
import { APIS } from "../../api";
import { useSafeState } from "ahooks";
import { REFRESH_PLUSINS, event } from "@kn/common";


const Item: React.FC<{ item: any, handleUnInstall: (id: string) => void }> = ({ item, handleUnInstall }) => {
    const navigator = useNavigator()
    const { usePath } = useUploadFile()
    return <TooltipProvider>
        <Tooltip>
            <TooltipTrigger>
                <div className=" flex items-center gap-2 rounded-md p-2 h-[75px] hover:bg-muted/50 relative border-b" onClick={() => {
                    navigator.go({
                        to: `/plugin-hub/${item.id}`
                    })
                }}>
                    <div >
                        <Avatar>
                            <img src={usePath(item.icon)} />
                        </Avatar>
                    </div>
                    <div className="flex flex-col items-start gap-[2px]">
                        <div className="flex items-center gap-6">
                            <div className="text-sm text-left font-medium leading-none text-nowrap w-full">
                                {item.name}
                            </div>
                            <div className="flex gap-1 text-[12px]">
                                <div className="flex items-center"><DownloadCloud className="h-3 w-3" />100M</div>
                                <div className="flex items-center"><Star className="h-3 w-3" />100M</div>
                            </div>
                        </div>
                        <div className="text-sm  text-left text-muted-foreground w-[120px] text-nowrap overflow-ellipsis">
                            {item.description}
                        </div>
                        <div className="flex gap-2">
                            <Badge>{item.developer}</Badge>
                            <Button variant="secondary" size="sm" className="h-6 px-2 flex items-center gap-1" onClick={(e) => {
                                e.stopPropagation()
                                handleUnInstall(item.activeVersionId)
                                event.emit(REFRESH_PLUSINS)
                            }}>
                                <Trash2 className="h-3 w-3" />
                                Uninstall
                            </Button>
                        </div>
                    </div>
                </div>
            </TooltipTrigger>
            <TooltipContent side="right" className="space-y-1 w-[300px]">
                <div className="text-[16px]">{item.name}</div>
                <div className="flex gap-1 text-[14px]">
                    <div className="flex items-center"><DownloadCloud className="h-3 w-3" />100M</div>
                    <Separator orientation="vertical" />
                    <div className="flex items-center"><Star fill="text-yellow-500" className="h-3 w-3" />100M</div>
                </div>
                <div className="text-[14px] text-muted-foreground">
                    {item.description}
                </div>
            </TooltipContent>
        </Tooltip>
    </TooltipProvider>
}

export const Shop: React.FC = () => {

    const [installedPlugins, setInstalledPlugins] = useSafeState([])
    const navigator = useNavigator()
    const [flag, setFlag] = useState(0)
    const [open, setOpen] = useState(false)
    const [currentId, setCurrentId] = useState<string | undefined>()

    useEffect(() => {
        useApi(APIS.GET_INSTALLED_PLUGINS).then(res => {
            setInstalledPlugins(res.data)
        })
    }, [flag])

    useEffect(() => {
        event.on("REFRESH_PLUSINS", () => {
            setFlag(f => f + 1)
        })
    }, [])

    const goToMarketplace = () => {
        navigator.go({
            to: '/plugin-hub'
        })
    }

    const uninstall = (versionId: string) => {
        setOpen(true)
        setCurrentId(versionId)
    }

    return <div className=" grid grid-cols-[300px_1fr] w-full">
        <div className=" border-r w-full h-screen">
            <div className="text-[12px] flex flex-row justify-between items-center p-2">
                <div>EXTENSIONS</div>
                <div className="flex gap-1 items-center">
                    <div className="cursor-pointer hover:bg-muted p-1 rounded-sm">
                        <RefreshCcw className="h-4 w-4" />
                    </div>
                    <div className="cursor-pointer hover:bg-muted p-1 rounded-sm">
                        <PluginUploader>
                            <PlusSquare className="h-4 w-4" />
                        </PluginUploader>
                    </div>
                    <div className="cursor-pointer hover:bg-muted p-1 rounded-sm">
                        <PluginManager>
                            <Slack className="h-4 w-4" />
                        </PluginManager>
                    </div>
                </div>
            </div>
            <div className="px-1">
                <Input className="h-7" placeholder="Search Extensions in Marketplace" />
            </div>
            <Accordion type="multiple" defaultValue={["installed", "recommended"]} className="h-[calc(100vh-70px)] overflow-auto">
                <AccordionItem value="installed" className="p-1">
                    <AccordionTrigger className="text-[12px] p-0 pb-1 ">INSTALLED</AccordionTrigger>
                    <AccordionContent>
                        <div className="flex flex-col gap-1">
                            {
                                installedPlugins.length > 0 ? installedPlugins.map((plugin, index) => {
                                    return <Item key={index} item={plugin} handleUnInstall={uninstall} />
                                }) : <EmptyState
                                    title="No installed plugins"
                                    className=" border-none "
                                    action={{
                                        label: "Get Plugins",
                                        onClick: () => {
                                            goToMarketplace()
                                        }
                                    }}
                                    icons={[BoxSelect]}
                                    description="" />
                            }
                        </div>
                    </AccordionContent>
                </AccordionItem>
                {/* <AccordionItem value="recommended" className="p-1">
                    <AccordionTrigger className="text-[12px] p-0 pb-1 ">RECOMMENDED</AccordionTrigger>
                    <AccordionContent>
                        <div className="flex flex-col gap-1">
                            <Item />
                            <Item />
                        </div>
                    </AccordionContent>
                </AccordionItem> */}
            </Accordion>
        </div>
        <div>
            <Outlet />
        </div>
        <AlertDialog open={open} onOpenChange={setOpen}>
            <AlertDialogTrigger />
            <AlertDialogContent>
                <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                    This action cannot be undone. This will permanently remove the plugin.
                </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => {
                        setCurrentId(undefined)
                        setOpen(false)
                }}>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => {
                        if (currentId) {
                             useApi(APIS.UNINSTALL_PLUGIN, { versionId: currentId }).then(res => {
                                 setFlag(f => f + 1)
                                 setOpen(false)
                            })
                        }
                }}>Continue</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    </div>
}