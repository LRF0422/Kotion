/**
 * API definitions for bidirectional links
 * @module @kn/plugin-block-reference/bidirectional-link/api
 */

import { API } from "@kn/common";

export const APIS = {
    /** Get backlinks for a page */
    GET_PAGE_BACKLINKS: {
        url: '/knowledge-wiki/space/page/:pageId/backlinks',
        method: 'GET',
        name: 'Get Page Backlinks'
    } as API,

    /** Get backlinks for a block */
    GET_BLOCK_BACKLINKS: {
        url: '/knowledge-wiki/space/page/block/:blockId/backlinks',
        method: 'GET',
        name: 'Get Block Backlinks'
    } as API,

    /** Search pages for link picker (page tree) */
    GET_PAGE_TREE: {
        url: '/knowledge-wiki/space/:spaceId/page/tree',
        method: 'GET',
        name: 'Get Page Tree'
    } as API,

    /** Search blocks for block picker */
    GET_BLOCKS: {
        url: '/knowledge-wiki/space/page/blocks',
        method: 'GET',
        name: 'Get Blocks'
    } as API,

    /** Get single block info by ID */
    GET_BLOCK_INFO: {
        url: '/knowledge-wiki/space/page/block',
        method: 'GET',
        name: 'Get Block Info'
    } as API,
};
