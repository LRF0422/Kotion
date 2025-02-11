import { BellRing, DownloadCloud, PlusSquare, RefreshCcw, Star } from "@repo/icon";
import {
    Accordion, AccordionContent,
    AccordionItem, AccordionTrigger,
    Badge, Input, Separator, Tooltip,
    TooltipContent, TooltipProvider, TooltipTrigger
} from "@repo/ui";
import React from "react";
import { useNavigator } from "../../hooks/use-navigator";
import { Outlet } from "react-router-dom";
import { PluginUploader } from "./PluginUploader";


const Item = () => {
    const navigator = useNavigator()
    return <TooltipProvider>
        <Tooltip>
            <TooltipTrigger>
                <div className=" flex items-center gap-2 rounded-md p-4 h-[75px] hover:bg-muted cursor-pointer relative" onClick={() => {
                    navigator.go({
                        to: '/plugin-hub/12123132'
                    })
                }}>
                    <div >
                        <BellRing className="h-6 w-6" />
                    </div>
                    <div className="flex flex-col items-start">
                        <div className="flex items-center">
                            <div className="text-sm text-left font-medium leading-none text-nowrap w-[145px]">
                                Push Notifications
                            </div>
                            <div className="flex gap-1 text-[12px]">
                                <div className="flex items-center"><DownloadCloud className="h-3 w-3" />100M</div>
                                <div className="flex items-center"><Star className="h-3 w-3" />100M</div>
                            </div>
                        </div>
                        <div className="text-sm text-muted-foreground text-nowrap w-[120px] text-ellipsis">
                            Send notifications to device.
                        </div>
                        <Badge>Knowledge</Badge>
                    </div>
                </div>
            </TooltipTrigger>
            <TooltipContent side="right" className="space-y-1">
                <div className="text-[16px]">Push Notification</div>
                <div className="flex gap-1 text-[14px]">
                    <div className="flex items-center"><DownloadCloud className="h-3 w-3" />100M</div>
                    <Separator orientation="vertical" />
                    <div className="flex items-center"><Star fill="text-yellow-500" className="h-3 w-3" />100M</div>
                </div>
                <div className="text-[14px] text-muted-foreground">Send notifications to device.</div>
            </TooltipContent>
        </Tooltip>
    </TooltipProvider>
}

export const Shop: React.FC = () => {
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
                </div>
            </div>
            <div className="px-1">
                <Input className="h-7" placeholder="Search Extensions in Marketplace" />
            </div>
            <Accordion type="multiple" className="h-[calc(100vh-70px)] overflow-auto">
                <AccordionItem value="installed" className="p-1">
                    <AccordionTrigger className="text-[12px] p-0 pb-1 ">INSTALLED</AccordionTrigger>
                    <AccordionContent>
                        <div className="flex flex-col gap-1">
                            <Item />
                            <Item />
                        </div>
                    </AccordionContent>
                </AccordionItem>
                <AccordionItem value="recommended" className="p-1">
                    <AccordionTrigger className="text-[12px] p-0 pb-1 ">RECOMMENDED</AccordionTrigger>
                    <AccordionContent>
                        <div className="flex flex-col gap-1">
                            <Item />
                            <Item />
                        </div>
                    </AccordionContent>
                </AccordionItem>
            </Accordion>
        </div>
        <div>
            <Outlet />
        </div>
    </div>
}