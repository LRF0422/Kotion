/**
 * Local Backlink Index
 *
 * Client-side fallback that builds the backlink graph by scanning a space's
 * block content, used until the `knowledge-wiki` backend exposes a real
 * backlinks index. Once the backend returns data, `BacklinksPanel` prefers it
 * and this module is bypassed (see BacklinksPanel.tsx).
 *
 * Strategy: one `queryBlocks({ spaceId })` call returns every block in the
 * space (each with parsed ProseMirror `content`, its `pageId`, `pageTitle`).
 * We walk every block looking for structured references to other pages and
 * invert them into a Map<targetPageId, BacklinkVO[]>.
 *
 * Known limitations (backend needed to lift):
 * - Only covers the CURRENT space; cross-space backlinks are not discovered.
 * - Only recognises structured references — `PageReference` nodes and
 *   `pageLink` marks. Plain `[[Title]]` text without a mark is ignored.
 *
 * @module @kn/plugin-block-reference/bidirectional-link/services
 */

import { event, logger } from "@kn/common";
import { LRUCache } from "../../utils/cache";
import { NODE_NAMES } from "../../constants";
import type { BacklinkVO, SpaceService } from "../../types";

/** Hard cap so a pathologically large space can't freeze the UI. */
const MAX_BLOCKS_SCANNED = 2000;

/** Snippet length shown under each backlink. */
const SNIPPET_MAX = 100;

/** Cache the inverted index per space (key = spaceId). */
const indexCache = new LRUCache<Map<string, BacklinkVO[]>>();

// Invalidate a space's index after any page save so the next open re-scans.
// ON_PAGE_REFRESH is emitted by the editor on reference creation / page save.
event.on("ON_PAGE_REFRESH", () => {
    indexCache.clear();
});

type AnyNode = {
    type?: string;
    text?: string;
    attrs?: Record<string, any>;
    marks?: { type: string; attrs?: Record<string, any> }[];
    content?: AnyNode[];
};

/** Normalise a block's `content` (string | node | node[]) into a node array. */
function normalizeContent(content: any): AnyNode[] {
    if (!content) return [];
    let parsed = content;
    if (typeof content === "string") {
        try {
            parsed = JSON.parse(content);
        } catch {
            return [];
        }
    }
    if (Array.isArray(parsed)) return parsed as AnyNode[];
    if (parsed && typeof parsed === "object") return [parsed as AnyNode];
    return [];
}

/** Collect every target pageId referenced inside a content tree (structured refs only). */
function collectReferencedPageIds(nodes: AnyNode[]): Set<string> {
    const targets = new Set<string>();
    const walk = (node: AnyNode) => {
        if (!node || typeof node !== "object") return;

        // PageReference node (inserted by PageSelector as type "PageReference")
        if (node.type === NODE_NAMES.PAGE_REFERENCE && node.attrs?.pageId != null) {
            targets.add(String(node.attrs.pageId));
        }

        // pageLink mark on a text node ([[Title]] bidirectional link)
        if (node.marks?.length) {
            for (const mark of node.marks) {
                if (mark.type === "pageLink" && mark.attrs?.pageId != null) {
                    targets.add(String(mark.attrs.pageId));
                }
            }
        }

        if (node.content?.length) node.content.forEach(walk);
    };
    nodes.forEach(walk);
    return targets;
}

/** Flatten all text in a content tree into a trimmed snippet. */
function extractSnippet(nodes: AnyNode[]): string {
    const parts: string[] = [];
    const walk = (node: AnyNode) => {
        if (!node || typeof node !== "object") return;
        if (node.text) parts.push(node.text);
        if (node.content?.length) node.content.forEach(walk);
    };
    nodes.forEach(walk);
    const text = parts.join(" ").replace(/\s+/g, " ").trim();
    return text.length > SNIPPET_MAX ? text.slice(0, SNIPPET_MAX) + "…" : text;
}

/**
 * Build (or read from cache) the inverted backlink index for a space.
 * @returns Map keyed by target pageId → list of backlinks pointing at it.
 */
export async function buildSpaceBacklinkIndex(
    spaceId: string,
    spaceService: SpaceService,
): Promise<Map<string, BacklinkVO[]>> {
    const cached = indexCache.get(spaceId);
    if (cached) return cached;

    const index = new Map<string, BacklinkVO[]>();

    let blocks: any[] = [];
    try {
        const res: any = await spaceService.queryBlocks({ spaceId });
        blocks = Array.isArray(res) ? res : res?.records ?? [];
    } catch (err) {
        logger.warn("[localBacklinkIndex] queryBlocks failed", err);
        return index; // empty index; panel degrades to "no backlinks"
    }

    if (blocks.length > MAX_BLOCKS_SCANNED) {
        logger.warn(
            `[localBacklinkIndex] space ${spaceId} has ${blocks.length} blocks; ` +
            `scanning first ${MAX_BLOCKS_SCANNED} only`,
        );
        blocks = blocks.slice(0, MAX_BLOCKS_SCANNED);
    }

    // Dedup key: a given source page counts once per target page.
    const seen = new Set<string>();

    for (const block of blocks) {
        const nodes = normalizeContent(block?.content);
        if (!nodes.length) continue;

        const targets = collectReferencedPageIds(nodes);
        if (!targets.size) continue;

        const sourcePageId = block?.pageId;
        if (sourcePageId == null) continue;
        const snippet = extractSnippet(nodes);

        for (const targetPageId of targets) {
            // A page never lists itself as a backlink.
            if (String(sourcePageId) === targetPageId) continue;

            const dedupKey = `${sourcePageId}->${targetPageId}`;
            if (seen.has(dedupKey)) continue;
            seen.add(dedupKey);

            const vo: BacklinkVO = {
                sourceType: "BLOCK",
                sourceId: String(block.id),
                sourcePageId: Number(sourcePageId),
                sourcePageTitle: block.pageTitle || "未命名",
                sourceBlockId: String(block.id),
                sourceSpaceId: block.spaceId != null ? String(block.spaceId) : spaceId,
                snippet,
                linkKind: "NORMAL",
                sourcePageIcon: null,
            };

            const list = index.get(targetPageId);
            if (list) list.push(vo);
            else index.set(targetPageId, [vo]);
        }
    }

    indexCache.set(spaceId, index);
    return index;
}

/**
 * Get locally-computed backlinks for a single page.
 * @param spaceId Current space
 * @param targetPageId Page whose backlinks we want
 */
export async function getLocalPageBacklinks(
    spaceId: string | undefined,
    targetPageId: number | string | undefined,
    spaceService: SpaceService,
): Promise<BacklinkVO[]> {
    if (!spaceId || targetPageId == null) return [];
    try {
        const index = await buildSpaceBacklinkIndex(spaceId, spaceService);
        return index.get(String(targetPageId)) ?? [];
    } catch (err) {
        logger.warn("[localBacklinkIndex] getLocalPageBacklinks failed", err);
        return [];
    }
}
