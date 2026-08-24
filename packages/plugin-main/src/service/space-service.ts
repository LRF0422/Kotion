import { Page } from "@kn/common"
import { Space } from "../model/Space"
import { useApi } from "@kn/common"
import { APIS } from "../api"


export interface CreatePageInput {
    spaceId: string
    title: string
    parentId?: string
    templateId?: string
}

export interface SpaceService {
    getSpaceInfo: (spaceId: string) => Promise<Space>
    querySpaces: () => Promise<Page<Space>>
    getPageTree: (spaceId: string, searchValue?: string) => Promise<any>
    queryPage: (params: { spaceId?: string, status?: string, searchValue?: string, pageSize?: number }) => Promise<Page<any>>,
    createPage: (page: CreatePageInput) => Promise<any>,
    getPage: (pageId: string) => Promise<any>,
    queryBlocks: (params: {
        pageId?: string
        pageTitle?: string
        spaceId?: string
    }) => Promise<any>,
    getBlockInfo: (blockId: string) => Promise<any>,
    saveAsTemplate: (spaceId: string) => Promise<any>,
    movePage: (pageId: string, targetParentId: number | null, targetSpaceId: number) => Promise<any>,
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
    queryPage: async (params: { spaceId?: string, status?: string, searchValue?: string, pageSize?: number }) => {
        // Omitting spaceId returns pages across all spaces (cross-space search).
        const res = await useApi(APIS.QUERY_PAGE, {
            spaceId: params.spaceId,
            status: params.status,
            searchValue: params.searchValue,
            pageSize: params.pageSize,
        })
        return res.data
    },
    createPage: async (page: CreatePageInput) => {
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
    },
    movePage: async (pageId: string, targetParentId: number | null, targetSpaceId: number) => {
        const res = await useApi(APIS.MOVE_PAGE, { id: pageId }, { targetParentId, targetSpaceId })
        return res.data
    }
}