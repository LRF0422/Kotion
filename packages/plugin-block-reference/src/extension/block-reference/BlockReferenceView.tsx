import { NodeViewContent, NodeViewProps, NodeViewWrapper } from "@kn/editor";
import React, { useContext, useEffect, useState } from "react";
import { useNavigator, useParams, useService, useToggle } from "@kn/core";
import { PageContext } from "@kn/editor";
import { event } from "@kn/common";
import { Loader2, SquareArrowOutUpRight, SquareArrowUpRight } from "@kn/icon";


export const BlockReferenceView: React.FC<NodeViewProps> = (props) => {

    const params = useParams()
    const pageInfo = useContext(PageContext)
    const { pageId, type } = props.node.attrs
    const [title, setTitle] = useState<string>()
    const navigator = useNavigator()
    const [loading, { toggle }] = useToggle(false)
    // @ts-ignore
    const spaceService = useService("spaceService") as any

    useEffect(() => {
        toggle()
        if (!pageId) {
            if (params.id) {
                spaceService.createPage({
                    spaceId: params.id,
                    parentId: type === "CHILD" ? pageInfo.id : pageInfo.parentId,
                    title: '未命名'
                }).then((res: any) => {
                    props.updateAttributes({
                        pageId: res.id,
                        spaceId: pageInfo.spaceId
                    })
                    event.emit("ON_PAGE_REFRESH")
                    setTitle("未命名")
                    toggle()
                })
            }
        } else {
            spaceService.getPage(pageId).then((res: any) => {
                if (res) {
                    setTitle(res.title)
                } else {
                    setTitle("该页面已经被删除")
                }
                toggle()
            })
        }
    }, [pageId])


    return <NodeViewWrapper as="span" className=" inline-flex items-center gap-1 align-middle cursor-pointer hover:underline" onClick={(e: any) => {
        e.preventDefault()
        e.stopPropagation()
        navigator.go({
            to: `/space-detail/${pageInfo.spaceId}/page/${pageId}`
        })
    }} >
        {
            loading ? <Loader2 className="h-4 w-4 animate-spin" /> :
                <>
                    <SquareArrowOutUpRight className="h-4 w-4" />
                    {title}
                </>
        }
    </NodeViewWrapper>
};