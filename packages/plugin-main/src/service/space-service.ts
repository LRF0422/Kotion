import { Page } from "@kn/common"
import { Space } from "../model/Space"
import { useApi } from "@kn/core"
import { APIS } from "../api"


export interface SpaceService {
    getSpaceInfo: (spaceId: string) => Promise<Space>
    querySpaces: () => Promise<Page<Space>>
    getPageTree: (spaceId: string, searchValue?: string) => Promise<any>
    queryPage: (params: { spaceId?: string, status?: string }) => Promise<Page<any>>,
    createPage: (page: any) => Promise<any>,
    getPage: (pageId: string) => Promise<any>,
    queryBlocks: (params: {
        pageId?: string
        pageTitle?: string
        spaceId?: string
    }) => Promise<any>,
    getBlockInfo: (blockId: string) => Promise<any>,
    saveAsTemplate: (spaceId: string) => Promise<any>,
}

export const spaceService: SpaceService = {
    getSpaceInfo: async (spaceId: string) => {
        return (await useApi(APIS.SPACE_DETAIL, { id: spaceId })).data
    },
    querySpaces: async () => {
        const res = await useApi(APIS.QUERY_SPACE)
        return res.data
    },
    getPageTree: async (spaceId: string, searchValue?: string) => {
        const res = await useApi(APIS.GET_PAGE_TREE, { id: spaceId, searchValue })
        return res.data
    },
    queryPage: async (params: { spaceId?: string, status?: string }) => {
        const res = await useApi(APIS.QUERY_PAGE, { spaceId: params.spaceId, status: params.status })
        return res.data
    },
    createPage: async (page: any) => {
        const res = await useApi(APIS.CREATE_OR_SAVE_PAGE, null, page)
        return res.data
    },
    getPage: async (pageId: string) => {
        const res = await useApi(APIS.GET_PAGE_CONTENT, { id: pageId })
        return res.data
    },
    queryBlocks: async (params) => {
        const res = await useApi(APIS.QUERY_BLOCKS, params)
        return res.data
    },
    getBlockInfo: async (blockId: string) => {
        const res = await useApi(APIS.GET_BLOCK_INFO, { id: blockId })
        return res.data
    },
    saveAsTemplate: async (spaceId: string) => {
        const res = await useApi(APIS.SAVE_SPACE_AS_TEMPLATE, { id: spaceId })
        return res.data
    }
}