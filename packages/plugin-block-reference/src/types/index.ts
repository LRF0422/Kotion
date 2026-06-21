/**
 * Type definitions for Block Reference Plugin
 * @module @kn/plugin-block-reference/types
 */

/**
 * Backlink source type
 */
export type BacklinkSourceType = 'PAGE' | 'BLOCK';

/**
 * Backlink kind
 */
export type BacklinkKind = 'NORMAL' | 'MENTION' | 'EMBED';

/**
 * Backlink information structure
 * Represents a reference from another page/block to the current page/block
 */
export interface BacklinkVO {
    /** Type of source: PAGE or BLOCK */
    sourceType: BacklinkSourceType;
    /** Source ID (page ID as string or block ID) */
    sourceId: string;
    /** Page ID containing the link */
    sourcePageId: number;
    /** Title of the source page */
    sourcePageTitle: string;
    /** Block ID if source is a block */
    sourceBlockId: string | null;
    /** Space ID of the source page (needed for cross-space navigation; optional until backend provides it) */
    sourceSpaceId?: string;
    /** Text snippet around the link */
    snippet: string;
    /** Link kind: NORMAL, MENTION, EMBED */
    linkKind: BacklinkKind;
    /** Icon of source page */
    sourcePageIcon: {
        type: string;
        icon: string;
    } | null;
}

/**
 * Block information structure
 */
export interface BlockInfo {
    /** Unique block identifier */
    id: string;
    /** Block type (e.g., 'doc', 'paragraph', 'heading') */
    type: 'doc' | string;
    /** JSON string of block content */
    content: any;
    /** ID of the space containing this block */
    spaceId: string;
    /** ID of the page containing this block */
    pageId: string;
    /** Name of the space (for display purposes) */
    spaceName?: string;
    /** Title of the page (for display purposes) */
    pageTitle?: string;
}

/**
 * Page information structure
 */
export interface PageInfo {
    /** Unique page identifier */
    id: string;
    /** Page title */
    title: string;
    /** Page icon configuration */
    icon?: {
        icon: string;
    };
    /** ID of the space containing this page */
    spaceId: string;
    /** Name of the space containing this page (for display in cross-space search) */
    spaceName?: string;
    /** ID of the parent page (for nested pages) */
    parentId?: string;
    /** JSON string of page content */
    content?: string;
}

/**
 * Space information structure
 */
export interface SpaceInfo {
    /** Unique space identifier */
    id: string;
    /** Space name */
    name: string;
}

/**
 * Parameters for querying blocks
 */
export interface QueryBlocksParams {
    /** Filter by space ID */
    spaceId?: string;
    /** Search term for filtering blocks */
    searchValue?: string;
}

/**
 * Parameters for querying pages
 */
export interface QueryPageParams {
    /** Filter by space ID. Omit to search across all spaces (cross-space). */
    spaceId?: string;
    /** Search term for filtering pages */
    searchValue?: string;
    /** Max number of records to return (backend default is 10) */
    pageSize?: number;
}

/**
 * Generic query response structure
 */
export interface QueryResponse<T> {
    /** Array of query results */
    records: T[];
    /** Total count of matching records */
    total?: number;
}

/**
 * Parameters for creating a new page
 */
export interface CreatePageParams {
    /** Space ID where the page will be created */
    spaceId: string;
    /** Parent page ID (for nested pages) */
    parentId?: string;
    /** Initial page title */
    title: string;
}

/**
 * Space service interface for data operations
 */
export interface SpaceService {
    /** Query blocks with optional filters */
    queryBlocks: (params: QueryBlocksParams) => Promise<QueryResponse<BlockInfo>>;
    /** Query all available spaces */
    querySpaces: () => Promise<QueryResponse<SpaceInfo>>;
    /** Query pages with optional filters */
    queryPage: (params: QueryPageParams) => Promise<QueryResponse<PageInfo>>;
    /** Get detailed information for a specific block */
    getBlockInfo: (blockId: string) => Promise<BlockInfo | null>;
    /** Get detailed information for a specific page */
    getPage: (pageId: string) => Promise<PageInfo | null>;
    /** Create a new page */
    createPage: (params: CreatePageParams) => Promise<PageInfo>;
    /** Get backlinks for a page */
    getPageBacklinks?: (pageId: number) => Promise<BacklinkVO[]>;
    /** Get backlinks for a block */
    getBlockBacklinks?: (blockId: string) => Promise<BacklinkVO[]>;
    /** Search pages for link picker */
    getPageTree?: (spaceId: string, searchValue?: string) => Promise<PageInfo[]>;
}

// Module augmentation to register SpaceService in the Services interface
declare module '@kn/common' {
    interface Services {
        spaceService: SpaceService;
    }
}

/**
 * Reference type enum
 * - CHILD: Reference to a child page
 * - BROTHER: Reference to a sibling page
 * - LINK: Reference to any existing page
 */
export type ReferenceType = 'CHILD' | 'BROTHER' | 'LINK';

/**
 * Attributes for page reference nodes
 */
export interface PageReferenceAttrs {
    /** Referenced page ID */
    pageId: string | null;
    /** Space ID of the referenced page */
    spaceId: string | null;
    /** Type of reference */
    type: ReferenceType;
}

/**
 * Attributes for block reference nodes
 */
export interface BlockReferenceAttrs {
    /** Referenced block ID */
    blockId: string | null;
    /** Space ID of the referenced block */
    spaceId: string | null;
    /** Page ID containing the referenced block */
    pageId: string | null;
    /** Type of reference (optional) */
    type?: ReferenceType;
}
