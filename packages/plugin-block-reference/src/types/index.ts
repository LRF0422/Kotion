import type { BlockId, PageId, SpaceId } from "@kn/common";

/**
 * Reference type enum
 * - CHILD: Reference to a child page
 * - BROTHER: Reference to a sibling page
 * - LINK: Reference to any existing page
 */
export type ReferenceType = 'CHILD' | 'BROTHER' | 'LINK';

/** Attributes for page reference nodes. */
export interface PageReferenceAttrs {
    pageId: PageId | null;
    spaceId: SpaceId | null;
    type: ReferenceType;
}

/** Attributes for block reference nodes. */
export interface BlockReferenceAttrs {
    blockId: BlockId | null;
    spaceId: SpaceId | null;
    pageId: PageId | null;
    type?: ReferenceType;
}
