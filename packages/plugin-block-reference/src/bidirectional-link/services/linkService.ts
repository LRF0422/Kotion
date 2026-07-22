/**
 * Link Service - API layer for bidirectional links
 * @module @kn/plugin-block-reference/bidirectional-link/services
 */

import { useApi } from "@kn/common";
import { APIS } from "../api";

// Single source of truth for the backlink shape lives in ../../types.
export type { BacklinkVO } from "../../types";
import type { BacklinkVO } from "../../types";

/**
 * Page tree node structure
 */
export interface PageTreeNode {
    id: number;
    name: string;
    parentId: number;
    children?: PageTreeNode[];
    /** Owning space id (present for cross-space search results) */
    spaceId?: number | string;
    /** Owning space name (for display) */
    spaceName?: string;
}

/**
 * Block info structure
 */
export interface BlockInfo {
    id: string;
    pageId: number;
    /** Title of the page containing this block (used by the grouped picker) */
    pageTitle?: string;
    type: string;
    content: any;
}

/**
 * Get backlinks for a page
 * @param pageId Target page ID. Accepts string to preserve 19-digit snowflake
 *   precision (Number would corrupt ids > 2^53 and 404 the request).
 */
export async function getPageBacklinks(pageId: string | number): Promise<BacklinkVO[]> {
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
 * Search pages for the link picker, across ALL spaces.
 *
 * Uses the flat /page/list endpoint with no spaceId so results are not limited
 * to the current space; the picker flattens trees anyway, so a flat list works.
 *
 * @param query Search keyword
 */
export async function searchPages(query?: string): Promise<PageTreeNode[]> {
    try {
        const res = await useApi(APIS.QUERY_PAGE, { searchValue: query, pageSize: 50 });
        const records = res.data?.records ?? [];
        return records.map((p: any): PageTreeNode => ({
            id: p.id,
            name: p.title,
            parentId: 0,
            spaceId: p.spaceId,
            spaceName: p.spaceName,
        }));
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
