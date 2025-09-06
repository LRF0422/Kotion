import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@kn/ui";
import React, { PropsWithChildren, useEffect, useState } from "react";
import { PluginList } from "./PluginList";
import { useApi } from "../../../hooks";
import { APIS } from "../../../api";


export const PluginManager: React.FC<PropsWithChildren> = ({ children }) => {

    const [plugins ,setPlugins] = useState([])

    useEffect(() => {
        useApi(APIS.GET_PLUGIN_LIST).then(res => {
            setPlugins(res.data.records)
        })
    }, [])

    return <Dialog>
        <DialogTrigger asChild>{children}</DialogTrigger>
        <DialogContent className=" max-w-none w-[80%]">
            <DialogHeader>
                <DialogTitle>Manage Plugins</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-[200px_1fr] h-[calc(100vh*0.8)] w-full">
                <div className="h-full w-full border-r">
                    32123
                </div>
                <PluginList data={plugins} />
            </div>
        </DialogContent>
    </Dialog>
}