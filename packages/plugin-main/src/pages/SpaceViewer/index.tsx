import {
    useParams, useSafeState, useSpacePageService,
    type PageTreeNode, type Space
} from "@kn/common";
import React, { useEffect } from "react";


export const SpaceViewer: React.FC = () => {

    const [space, setSpace] = useSafeState<Space | null>(null)
    const [pages, setPages] = useSafeState<PageTreeNode[]>([])
    const params = useParams()
    const spacePageService = useSpacePageService()

    useEffect(() => {
        const spaceId = params.spaceId ? String(params.spaceId) : undefined
        if (!spaceId) return
        Promise.all([
            spacePageService.spaces.getSpace(spaceId),
            spacePageService.pages.getPageTree({ spaceId }),
        ]).then(([nextSpace, nextPages]) => {
            setSpace(nextSpace)
            setPages(nextPages)
        })
    }, [params.spaceId, spacePageService])

    return space && <div className="grid grid-cols-[280px_1fr] h-full w-full bg-muted/40 ">
    </div>
}