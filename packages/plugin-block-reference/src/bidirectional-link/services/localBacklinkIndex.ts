/**
 * Client-side backlink and unlinked-mention fallback.
 *
 * The backend relation index remains preferred. This scanner only covers the
 * current space and preserves the existing fallback behavior when remote
 * backlinks are unavailable or empty.
 */
import { logger } from "@kn/common";
import type { BlockSummary, PageRelation, SpacePageService } from "@kn/common";
import { LRUCache } from "../../utils/cache";
import { NODE_NAMES } from "../../constants";

const MAX_BLOCKS_SCANNED = 2000;
const SNIPPET_MAX = 100;
const MENTION_MIN_TITLE_LEN = 2;
const MENTION_MAX_RESULTS = 20;

const indexCache = new LRUCache<Map<string, PageRelation[]>>();
const blocksCache = new LRUCache<BlockSummary[]>();
const subscribedServices = new WeakSet<SpacePageService>();

const invalidateSpace = (spaceId?: string): void => {
    if (spaceId) {
        indexCache.invalidate(String(spaceId));
        blocksCache.invalidate(String(spaceId));
    } else {
        indexCache.clear();
        blocksCache.clear();
    }
};

/** Subscribe shared caches to canonical domain changes once per service. */
const ensureChangeSubscription = (service: SpacePageService): void => {
    if (subscribedServices.has(service)) return;
    subscribedServices.add(service);

    service.changes.subscribe("page.document.changed", ({ payload }) => invalidateSpace(payload.spaceId));
    service.changes.subscribe("page.relations.changed", ({ payload }) => invalidateSpace(payload.spaceId));
    service.changes.subscribe("page.updated", ({ payload }) => invalidateSpace(payload.spaceId ?? payload.page.spaceId));
    service.changes.subscribe("page.deleted", ({ payload }) => invalidateSpace(payload.spaceId));
    service.changes.subscribe("page.trashed", ({ payload }) => invalidateSpace(payload.spaceId));
    service.changes.subscribe("page.restoredFromTrash", ({ payload }) => invalidateSpace(payload.spaceId));
    service.changes.subscribe("page.moved", ({ payload }) => invalidateSpace(payload.spaceId));
};

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

function normalizeContent(content: unknown): AnyNode[] {
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

function collectReferencedPages(nodes: AnyNode[]): Map<string, string | null> {
    const targets = new Map<string, string | null>();
    const add = (pageId: unknown, title?: unknown) => {
        if (pageId == null) return;
        const key = String(pageId);
        if (!targets.has(key) || (title && !targets.get(key))) {
            targets.set(key, typeof title === "string" && title ? title : targets.get(key) ?? null);
        }
    };
    const walk = (node: AnyNode) => {
        if (!node || typeof node !== "object") return;
        if (node.type === NODE_NAMES.PAGE_REFERENCE && node.attrs?.pageId != null) {
            add(node.attrs.pageId);
        }
        if (node.type === "pageLinkNode" && node.attrs?.pageId != null) {
            add(node.attrs.pageId, node.attrs.title);
        }
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

function flattenText(nodes: AnyNode[]): string {
    const parts: string[] = [];
    const walk = (node: AnyNode) => {
        if (!node || typeof node !== "object") return;
        if (node.text) parts.push(node.text);
        if (node.type === "pageLinkNode" && node.attrs?.title) {
            parts.push(`[[${node.attrs.title}]]`);
        }
        if (node.content?.length) node.content.forEach(walk);
    };
    nodes.forEach(walk);
    return parts.join(" ").replace(/\s+/g, " ").trim();
}

function buildSnippet(text: string, keyword?: string | null): string {
    if (!text) return "";
    if (keyword) {
        const idx = text.toLowerCase().indexOf(keyword.toLowerCase());
        if (idx >= 0) {
            const half = Math.floor((SNIPPET_MAX - keyword.length) / 2);
            const start = Math.max(0, idx - half);
            const end = Math.min(text.length, idx + keyword.length + half);
            return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
        }
    }
    return text.length > SNIPPET_MAX ? `${text.slice(0, SNIPPET_MAX)}…` : text;
}

async function getSpaceBlocks(spaceId: string, service: SpacePageService): Promise<BlockSummary[]> {
    ensureChangeSubscription(service);
    const normalizedSpaceId = String(spaceId);
    const cached = blocksCache.get(normalizedSpaceId);
    if (cached) return cached;

    let blocks: BlockSummary[] = [];
    try {
        const result = await service.relations.queryBlocks({ spaceId: normalizedSpaceId });
        blocks = Array.isArray(result) ? result : [];
    } catch (err) {
        logger.warn("[localBacklinkIndex] queryBlocks failed", err);
        return [];
    }

    if (blocks.length > MAX_BLOCKS_SCANNED) {
        logger.warn(
            `[localBacklinkIndex] space ${normalizedSpaceId} has ${blocks.length} blocks; ` +
            `scanning first ${MAX_BLOCKS_SCANNED} only`,
        );
        blocks = blocks.slice(0, MAX_BLOCKS_SCANNED);
    }

    blocksCache.set(normalizedSpaceId, blocks);
    return blocks;
}

export async function buildSpaceBacklinkIndex(
    spaceId: string,
    service: SpacePageService,
): Promise<Map<string, PageRelation[]>> {
    ensureChangeSubscription(service);
    const normalizedSpaceId = String(spaceId);
    const cached = indexCache.get(normalizedSpaceId);
    if (cached) return cached;

    const index = new Map<string, PageRelation[]>();
    const blocks = await getSpaceBlocks(normalizedSpaceId, service);
    if (!blocks.length) return index;

    const seen = new Set<string>();
    for (const block of blocks) {
        const nodes = normalizeContent(block.content);
        if (!nodes.length) continue;

        const targets = collectReferencedPages(nodes);
        if (!targets.size || !block.pageId) continue;

        const sourcePageId = String(block.pageId);
        const sourceBlockId = String(block.id);
        const text = flattenText(nodes);

        for (const [targetPageId, linkTitle] of targets) {
            if (sourcePageId === targetPageId) continue;

            const dedupKey = `${sourcePageId}->${targetPageId}`;
            if (seen.has(dedupKey)) continue;
            seen.add(dedupKey);

            const relation: PageRelation = {
                sourceType: "BLOCK",
                sourceId: sourceBlockId,
                sourcePageId,
                sourcePageTitle: block.pageTitle || "Untitled",
                sourceBlockId,
                sourceSpaceId: block.spaceId ? String(block.spaceId) : normalizedSpaceId,
                targetPageId,
                snippet: buildSnippet(text, linkTitle),
                linkKind: "NORMAL",
                sourcePageIcon: null,
            };

            const list = index.get(targetPageId);
            if (list) list.push(relation);
            else index.set(targetPageId, [relation]);
        }
    }

    indexCache.set(normalizedSpaceId, index);
    return index;
}

export async function getLocalPageBacklinks(
    spaceId: string | undefined,
    targetPageId: string | undefined,
    service: SpacePageService,
): Promise<PageRelation[]> {
    if (!spaceId || !targetPageId) return [];
    try {
        const index = await buildSpaceBacklinkIndex(String(spaceId), service);
        return index.get(String(targetPageId)) ?? [];
    } catch (err) {
        logger.warn("[localBacklinkIndex] getLocalPageBacklinks failed", err);
        return [];
    }
}

export async function getUnlinkedMentions(
    spaceId: string | undefined,
    targetPageId: string | undefined,
    targetTitle: string | undefined,
    service: SpacePageService,
): Promise<PageRelation[]> {
    const title = targetTitle?.trim();
    if (!spaceId || !targetPageId || !title || title.length < MENTION_MIN_TITLE_LEN) return [];

    try {
        const normalizedSpaceId = String(spaceId);
        const targetKey = String(targetPageId);
        const blocks = await getSpaceBlocks(normalizedSpaceId, service);
        const lowerTitle = title.toLowerCase();
        const results: PageRelation[] = [];
        const seenPages = new Set<string>();

        for (const block of blocks) {
            if (results.length >= MENTION_MAX_RESULTS) break;
            if (!block.pageId) continue;

            const sourcePageId = String(block.pageId);
            if (sourcePageId === targetKey || seenPages.has(sourcePageId)) continue;

            const nodes = normalizeContent(block.content);
            if (!nodes.length) continue;

            const text = flattenText(nodes);
            if (!text.toLowerCase().includes(lowerTitle)) continue;
            if (collectReferencedPages(nodes).has(targetKey)) continue;
            if (text.toLowerCase().includes(`[[${lowerTitle}]]`)) continue;

            seenPages.add(sourcePageId);
            const sourceBlockId = String(block.id);
            results.push({
                sourceType: "BLOCK",
                sourceId: sourceBlockId,
                sourcePageId,
                sourcePageTitle: block.pageTitle || "Untitled",
                sourceBlockId,
                sourceSpaceId: block.spaceId ? String(block.spaceId) : normalizedSpaceId,
                targetPageId: targetKey,
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
