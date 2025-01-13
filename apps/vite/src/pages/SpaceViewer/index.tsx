import { APIS } from "../../api";
import { Sidebar, SidebarProvider } from "@repo/ui";
import { useApi } from "../../hooks/use-api";
import { Space } from "../../model/Space";
import { useSafeState } from "ahooks";
import React, { useEffect } from "react";
import { useParams } from "react-router-dom";


export const SpaceViewer: React.FC = () => {

    const [space, setSpace] = useSafeState<Space | null>(null)
    const [pages, setPages] = useSafeState()
    const params = useParams()

    useEffect(() => {
        useApi(APIS.SPACE_DETAIL, { id: params.spaceId }).then((res) => {
            setSpace(res.data)
            useApi(APIS.GET_PAGE_TREE, { id: params.spaceId }).then((r: any) => {
                setPages(r.data)
            })
        })
    }, [params?.spaceId])

    return space && <div className="grid grid-cols-[280px_1fr] h-full w-full bg-muted/40 ">
        <SidebarProvider>
            <Sidebar></Sidebar>
        </SidebarProvider>
    </div>
}