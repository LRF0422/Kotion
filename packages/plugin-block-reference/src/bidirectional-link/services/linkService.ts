/**
 * Link Service - API layer for bidirectional links
 * @module @kn/plugin-block-reference/bidirectional-link/services
 */

import { useApi } from "@kn/core";
import { APIS } from "../api";

/**
 * Backlink data structure
 */
export interface BacklinkVO {
    sourceType: 'PAGE' | 'BLOCK';
    sourceId: string;
    sourcePageId: number;
    sourcePageTitle: string;
    sourceBlockId: string | null;
    snippet: string;
    linkKind: string;
    sourcePageIcon: { type: string; icon: string } | null;
}

/**
 * Page tree node structure
 */
export interface PageTreeNode {
    id: number;
    name: string;
    parentId: number;
    children?: PageTreeNode[];
}

/**
 * Block info structure
 */
export interface BlockInfo {
    id: string;
    pageId: number;
    type: string;
    content: any;
}

/**
 * Get backlinks for a page
 * @param pageId Target page ID
 */
export async function getPageBacklinks(pageId: number): Promise<BacklinkVO[]> {
    try {
        const res = await useApi(APIS.GET_PAGE_BACKLINKS, { pageId });
        return res.data || [];
    } catch {
        return [];
    }
}

/**
 * Get backlinks for a block
 * @param blockId Target block ID
 */
export async function getBlockBacklinks(blockId: string): Promise<BacklinkVO[]> {
    try {
        const res = await useApi(APIS.GET_BLOCK_BACKLINKS, { blockId });
        return res.data || [];
    } catch {
        return [];
    }
}

/**
 * Search pages for link picker
 * @param spaceId Current space ID
 * @param query Search keyword
 */
export async function searchPages(spaceId: number | string, query?: string): Promise<PageTreeNode[]> {
    try {
        const res = await useApi(APIS.GET_PAGE_TREE, { spaceId, searchValue: query });
        return res.data || [];
    } catch {
        return [];
    }
}

/**
 * Search blocks for block picker
 * @param spaceId Space ID
 * @param pageId Page ID (optional)
 */
export async function searchBlocks(spaceId?: number | string, pageId?: number): Promise<{ records: BlockInfo[]; total: number }> {
    try {
        const res = await useApi(APIS.GET_BLOCKS, { spaceId, pageId });
        return res.data || { records: [], total: 0 };
    } catch {
        return { records: [], total: 0 };
    }
}
