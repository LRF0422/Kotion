import { BellRing, RefreshCcw } from "@repo/icon";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger, Input, Switch } from "@repo/ui";
import React from "react";


const Item = () => {
    return <div className=" flex items-center space-x-4 rounded-md p-4 h-[75px] hover:bg-muted cursor-pointer">
        <BellRing />
        <div className="flex-1 space-y-1">
            <p className="text-sm font-medium leading-none text-nowrap">
                Push Notifications
            </p>
            <p className="text-sm text-muted-foreground">
                Send notifications to device.
            </p>
        </div>
        <Switch />
    </div>
}

export const Shop: React.FC = () => {
    return <div className=" grid grid-cols-[300px_1fr] w-full">
        <div className=" border-r w-full h-screen">
            <div className="text-[12px] flex flex-row justify-between items-center p-2">
                <div>EXTENSIONS</div>
                <div className="cursor-pointer hover:bg-muted p-1 rounded-sm">
                    <RefreshCcw className="h-4 w-4" />
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
    </div>
}