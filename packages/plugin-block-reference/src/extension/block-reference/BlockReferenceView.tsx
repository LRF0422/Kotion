import { NodeViewContent, NodeViewProps, NodeViewWrapper } from "@kn/editor";
import React, { useContext, useEffect, useState } from "react";
import { useNavigate, useNavigator, useParams, useService } from "@kn/core";
import { SpaceService, spaceService } from "@kn/plugin-main"
import { PageContext } from "@kn/editor";
import { event } from "@kn/common";


export const BlockReferenceView: React.FC<NodeViewProps> = (props) => {

    const params = useParams()
    const pageInfo = useContext(PageContext)
    const { pageId, type } = props.node.attrs
    const [title, setTitle] = useState<string>()
    const navigator = useNavigator()

    useEffect(() => {
        console.log('pageInfo', pageInfo);
        
        if (!pageId) {
            if (params.id) {
                spaceService.createPage({
                    spaceId: params.id,
                    parentId: type === "CHILD" ? pageInfo.id : pageInfo.parentId,
                    title: '未命名'
                }).then((res) => {
                    props.updateAttributes({
                        pageId: res.id,
                        spaceId: pageInfo.spaceId
                    })
                    event.emit("ON_PAGE_REFRESH")
                    setTitle("未命名")
                })
            }
        } else {
            spaceService.getPage(pageId).then((res) => {
            setTitle(res.title)
            })
        }
    }, [])


    return <NodeViewWrapper as="span" className=" text-purple-600 underline hover:shadow-md" onDoubleClick={() => {
        navigator.go({
            to: `/space-detail/${pageInfo.spaceId}/page/${pageId}`
        })
    } } >
        {title}
    </NodeViewWrapper>
};