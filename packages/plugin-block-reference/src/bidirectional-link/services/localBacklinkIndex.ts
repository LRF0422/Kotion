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
 * Also exposes `getUnlinkedMentions`: blocks whose plain text contains the
 * target page's title without a structured link to it.
 *
 * Known limitations (backend needed to lift):
 * - Only covers the CURRENT space; cross-space backlinks are not discovered.
 * - Only recognises structured references — `PageReference` nodes, `pageLink`
 *   marks (legacy) and `pageLinkNode` atoms. Plain `[[Title]]` text without a
 *   mark is ignored.
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

/** Minimum title length considered for unlinked-mention matching. */
const MENTION_MIN_TITLE_LEN = 2;

/** Cap unlinked mentions so the panel stays scannable. */
const MENTION_MAX_RESULTS = 20;

/** Cache the inverted index per space (key = spaceId). */
const indexCache = new LRUCache<Map<string, BacklinkVO[]>>();

/** Cache the raw block list per space, shared by index build + mention scan. */
const blocksCache = new LRUCache<any[]>();

// Invalidate a space's index after any page save so the next open re-scans.
// ON_PAGE_REFRESH is emitted by the editor on reference creation / page save.
event.on("ON_PAGE_REFRESH", () => {
    indexCache.clear();
    blocksCache.clear();
});

/** Manual invalidation for the panel's refresh action. */
export function invalidateBacklinkIndex(): void {
    indexCache.clear();
    blocksCache.clear();
}

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

/**
 * Collect every target pageId referenced inside a content tree (structured
 * refs only), keeping the best-known link title for snippet centering.
 */
function collectReferencedPages(nodes: AnyNode[]): Map<string, string | null> {
    const targets = new Map<string, string | null>();
    const add = (pageId: any, title?: any) => {
        if (pageId == null) return;
        const key = String(pageId);
        if (!targets.has(key) || (title && !targets.get(key))) {
            targets.set(key, typeof title === "string" && title ? title : targets.get(key) ?? null);
        }
    };
    const walk = (node: AnyNode) => {
        if (!node || typeof node !== "object") return;

        // PageReference node (inserted by PageSelector as type "PageReference")
        if (node.type === NODE_NAMES.PAGE_REFERENCE && node.attrs?.pageId != null) {
            add(node.attrs.pageId);
        }

        // pageLinkNode atom ([[Title]] bidirectional link, current format)
        if (node.type === "pageLinkNode" && node.attrs?.pageId != null) {
            add(node.attrs.pageId, node.attrs.title);
        }

        // pageLink mark on a text node ([[Title]] link, legacy format)
        if (node.marks?.length) {
            for (const mark of node.marks) {
                if (mark.type === "pageLink" && mark.attrs?.pageId != null) {
                    add(mark.attrs.pageId, mark.attrs.title ?? node.text);
                }
            }
        }

        if (node.content?.length) node.content.forEach(walk);
    };
    nodes.forEach(walk);
    return targets;
}

/** Flatten all text in a content tree into one normalised string. */
function flattenText(nodes: AnyNode[]): string {
    const parts: string[] = [];
    const walk = (node: AnyNode) => {
        if (!node || typeof node !== "object") return;
        if (node.text) parts.push(node.text);
        // pageLinkNode atoms carry their text in attrs, not child text nodes.
        if (node.type === "pageLinkNode" && node.attrs?.title) {
            parts.push(`[[${node.attrs.title}]]`);
        }
        if (node.content?.length) node.content.forEach(walk);
    };
    nodes.forEach(walk);
    return parts.join(" ").replace(/\s+/g, " ").trim();
}

/**
 * Build a snippet from full text, centred on the first occurrence of
 * `keyword` when present (so the link/mention is visible in the excerpt).
 */
function buildSnippet(text: string, keyword?: string | null): string {
    if (!text) return "";
    if (keyword) {
        const idx = text.toLowerCase().indexOf(keyword.toLowerCase());
        if (idx >= 0) {
            const half = Math.floor((SNIPPET_MAX - keyword.length) / 2);
            const start = Math.max(0, idx - half);
            const end = Math.min(text.length, idx + keyword.length + half);
            return (
                (start > 0 ? "…" : "") +
                text.slice(start, end) +
                (end < text.length ? "…" : "")
            );
        }
    }
    return text.length > SNIPPET_MAX ? text.slice(0, SNIPPET_MAX) + "…" : text;
}

/** Fetch (or read from cache) every block in a space, capped for safety. */
async function getSpaceBlocks(spaceId: string, spaceService: SpaceService): Promise<any[]> {
    const cached = blocksCache.get(spaceId);
    if (cached) return cached;

    let blocks: any[] = [];
    try {
        const res: any = await spaceService.queryBlocks({ spaceId });
        blocks = Array.isArray(res) ? res : res?.records ?? [];
    } catch (err) {
        logger.warn("[localBacklinkIndex] queryBlocks failed", err);
        return [];
    }

    if (blocks.length > MAX_BLOCKS_SCANNED) {
        logger.warn(
            `[localBacklinkIndex] space ${spaceId} has ${blocks.length} blocks; ` +
            `scanning first ${MAX_BLOCKS_SCANNED} only`,
        );
        blocks = blocks.slice(0, MAX_BLOCKS_SCANNED);
    }

    blocksCache.set(spaceId, blocks);
    return blocks;
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
    const blocks = await getSpaceBlocks(spaceId, spaceService);
    if (!blocks.length) return index;

    // Dedup key: a given source page counts once per target page.
    const seen = new Set<string>();

    for (const block of blocks) {
        const nodes = normalizeContent(block?.content);
        if (!nodes.length) continue;

        const targets = collectReferencedPages(nodes);
        if (!targets.size) continue;

        const sourcePageId = block?.pageId;
        if (sourcePageId == null) continue;
        const text = flattenText(nodes);

        for (const [targetPageId, linkTitle] of targets) {
            // A page never lists itself as a backlink.
            if (String(sourcePageId) === targetPageId) continue;

            const dedupKey = `${sourcePageId}->${targetPageId}`;
            if (seen.has(dedupKey)) continue;
            seen.add(dedupKey);

            const vo: BacklinkVO = {
                sourceType: "BLOCK",
                sourceId: String(block.id),
                sourcePageId: Number(sourcePageId),
                sourcePageTitle: block.pageTitle || "Untitled",
                sourceBlockId: String(block.id),
                sourceSpaceId: block.spaceId != null ? String(block.spaceId) : spaceId,
                snippet: buildSnippet(text, linkTitle),
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

/**
 * Find unlinked mentions of a page: blocks whose plain text contains the
 * page's title but which have no structured link to it.
 *
 * @param spaceId Current space (only this space is scanned)
 * @param targetPageId Page being mentioned
 * @param targetTitle The page's current title (match keyword)
 */
export async function getUnlinkedMentions(
    spaceId: string | undefined,
    targetPageId: number | string | undefined,
    targetTitle: string | undefined,
    spaceService: SpaceService,
): Promise<BacklinkVO[]> {
    const title = targetTitle?.trim();
    if (!spaceId || targetPageId == null || !title || title.length < MENTION_MIN_TITLE_LEN) {
        return [];
    }

    try {
        const blocks = await getSpaceBlocks(spaceId, spaceService);
        const targetKey = String(targetPageId);
        const lowerTitle = title.toLowerCase();
        const results: BacklinkVO[] = [];
        // One mention per source page keeps the list scannable.
        const seenPages = new Set<string>();

        for (const block of blocks) {
            if (results.length >= MENTION_MAX_RESULTS) break;

            const sourcePageId = block?.pageId;
            if (sourcePageId == null || String(sourcePageId) === targetKey) continue;
            if (seenPages.has(String(sourcePageId))) continue;

            const nodes = normalizeContent(block?.content);
            if (!nodes.length) continue;

            const text = flattenText(nodes);
            const idx = text.toLowerCase().indexOf(lowerTitle);
            if (idx < 0) continue;

            // Skip if the mention is already a structured link ([[Title]] in
            // the flattened text marks pageLinkNode/legacy link output).
            if (collectReferencedPages(nodes).has(targetKey)) continue;
            const linked = text.toLowerCase().includes(`[[${lowerTitle}]]`);
            if (linked) continue;

            seenPages.add(String(sourcePageId));
            results.push({
                sourceType: "BLOCK",
                sourceId: String(block.id),
                sourcePageId: Number(sourcePageId),
                sourcePageTitle: block.pageTitle || "Untitled",
                sourceBlockId: String(block.id),
                sourceSpaceId: block.spaceId != null ? String(block.spaceId) : spaceId,
                snippet: buildSnippet(text, title),
                linkKind: "MENTION",
                sourcePageIcon: null,
            });
        }

        return results;
    } catch (err) {
        logger.warn("[localBacklinkIndex] getUnlinkedMentions failed", err);
        return [];
    }
}
