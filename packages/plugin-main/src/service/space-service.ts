import { Page } from "@kn/common"
import { Space } from "../model/Space"
import { useApi } from "@kn/core"
import { APIS } from "src/api"


export interface SpaceService {
    getSpaceInfo: (spaceId: string) => Promise<Space>
    querySpaces: () => Promise<Page<Space>>
    getPageTree: (spaceId: string, searchValue?: string) => Promise<any>
}

export const spaceService: SpaceService = {
    getSpaceInfo: async (spaceId: string) => {
        return (await useApi(APIS.SPACE_DETAIL, {id: spaceId})).data
    },
    querySpaces: async () => {
        const res = await fetch('/knowledge-wiki/space/list')
        return res.json()
    },
    getPageTree: async (spaceId: string, searchValue?: string) => {
        const res = await useApi(APIS.GET_PAGE_TREE, {id: spaceId, searchValue})
        return res.data
    },
}