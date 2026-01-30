/**
 * Type definitions for Block Reference Plugin
 * @module @kn/plugin-block-reference/types
 */

/**
 * Block information structure
 */
export interface BlockInfo {
    /** Unique block identifier */
    id: string;
    /** Block type (e.g., 'doc', 'paragraph', 'heading') */
    type: 'doc' | string;
    /** JSON string of block content */
    content: string;
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
    /** Filter by space ID */
    spaceId?: string;
    /** Search term for filtering pages */
    searchValue?: string;
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
