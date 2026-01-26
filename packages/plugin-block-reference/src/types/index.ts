/**
 * Type definitions for Block Reference Plugin
 */

export interface BlockInfo {
    id: string;
    type: 'doc' | string;
    content: string;
    spaceId: string;
    pageId: string;
    spaceName?: string;
    pageTitle?: string;
}

export interface PageInfo {
    id: string;
    title: string;
    icon?: {
        icon: string;
    };
    spaceId: string;
    parentId?: string;
    content?: string;
}

export interface SpaceInfo {
    id: string;
    name: string;
}

export interface QueryBlocksParams {
    spaceId?: string;
    searchValue?: string;
}

export interface QueryPageParams {
    spaceId?: string;
    searchValue?: string;
}

export interface QueryResponse<T> {
    records: T[];
    total?: number;
}

export interface CreatePageParams {
    spaceId: string;
    parentId?: string;
    title: string;
}

export interface SpaceService {
    queryBlocks: (params: QueryBlocksParams) => Promise<QueryResponse<BlockInfo>>;
    querySpaces: () => Promise<QueryResponse<SpaceInfo>>;
    queryPage: (params: QueryPageParams) => Promise<QueryResponse<PageInfo>>;
    getBlockInfo: (blockId: string) => Promise<BlockInfo | null>;
    getPage: (pageId: string) => Promise<PageInfo | null>;
    createPage: (params: CreatePageParams) => Promise<PageInfo>;
}

// Module augmentation to register SpaceService in the Services interface
declare module '@kn/common' {
    interface Services {
        spaceService: SpaceService;
    }
}

export type ReferenceType = 'CHILD' | 'BORTHER' | 'LINK';

export interface PageReferenceAttrs {
    pageId: string | null;
    spaceId: string | null;
    type: ReferenceType;
}

export interface BlockReferenceAttrs {
    blockId: string | null;
    spaceId: string | null;
    pageId: string | null;
    type?: ReferenceType;
}
