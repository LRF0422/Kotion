package com.knowledge.wiki.service.doc;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import com.knowledge.wiki.service.entity.Mark;
import com.knowledge.wiki.service.entity.PageContent;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.StrUtil;
import cn.hutool.json.JSONObject;
import lombok.Getter;

/**
 * One-time reassembler: rebuilds a ProseMirror document from the legacy
 * {@code wiki_page_block} rows, for the backfill into {@code wiki_block}.
 * <p>
 * <b>Why this is not {@code BlockStorageService.attachChildren}.</b> That method
 * reattaches children with {@code node.setContent(children)} — it <em>replaces</em>
 * the node's content with its child rows. For any node whose stored content
 * column still held real inline content (text) alongside extracted child rows,
 * that assignment destroys the text. Reusing it here would migrate the damage
 * into the new tables permanently, so this class merges instead of replacing and
 * reports every case where the merge had to guess.
 * </p>
 * <p>
 * <b>Ordering is preserved, not recomputed.</b> Top-level rows are sorted by the
 * same key the legacy read path used — {@code attrs.rank} when present, otherwise
 * a rank derived from {@code sort_order} — so a migrated page reads back in the
 * order its author last saw. A migration that silently reorders documents would
 * be indistinguishable from data loss to the person who wrote them.
 * </p>
 * <p>
 * Deliberately stateless and dependency-free: it takes rows, returns a document,
 * touches no cache and no database. That makes it safe to run in dry-run mode
 * against production data.
 * </p>
 */
public final class LegacyBlockReassembler {

    /** Legacy sentinel for "no parent", alongside null and empty string. */
    private static final String ROOT_PARENT_ID = "root";

    /**
     * Legacy node types whose children were always kept whole in the content
     * column. Mirrors {@code BlockStorageService.INLINE_CONTENT_HOLDER_TYPES};
     * duplicated rather than shared because that constant dies with the old
     * storage service and this one has to outlive it until the backfill is done.
     */
    private static final Set<String> INLINE_CONTENT_HOLDER_TYPES = Collections
            .unmodifiableSet(new HashSet<>(Arrays.asList("paragraph", "heading", "codeBlock")));

    private LegacyBlockReassembler() {
    }

    /** What the reassembly produced, plus everything a human needs to judge it. */
    @Getter
    public static final class Reassembled {

        /** The rebuilt document, {@code {type: "doc", content: [...]}}. */
        private final Map<String, Object> doc;

        /** Legacy rank per top-level block id, for rank preservation on write. */
        private final Map<String, String> legacyRanks;

        /** Total legacy rows read, at every depth. */
        private final int legacyRowCount;

        /** Depth-1 blocks in the rebuilt document. */
        private final int topLevelCount;

        /**
         * Rows that could not be placed because their {@code parent_id} names a row
         * that does not exist. They are dropped: with no parent there is no position
         * to put them in, and inventing one would be a guess about content.
         */
        private final List<String> orphanBlockIds;

        /** Human-readable notes; a non-empty list means the page wants review. */
        private final List<String> warnings;

        Reassembled(Map<String, Object> doc, Map<String, String> legacyRanks, int legacyRowCount, int topLevelCount,
                List<String> orphanBlockIds, List<String> warnings) {
            this.doc = doc;
            this.legacyRanks = legacyRanks;
            this.legacyRowCount = legacyRowCount;
            this.topLevelCount = topLevelCount;
            this.orphanBlockIds = orphanBlockIds;
            this.warnings = warnings;
        }
    }

    /**
     * Rebuild one page's document from its legacy rows.
     *
     * @param rows every {@code wiki_page_block} row of the page, any depth, any
     *             order
     */
    public static Reassembled reassemble(List<PageContent> rows) {
        List<String> warnings = new ArrayList<>();
        List<String> orphans = new ArrayList<>();
        Map<String, String> legacyRanks = new LinkedHashMap<>();

        List<PageContent> deduped = dedupById(rows, warnings);

        Map<String, List<PageContent>> childrenByParent = new HashMap<>();
        List<PageContent> topLevel = new ArrayList<>();
        Set<String> knownIds = new HashSet<>();
        for (PageContent row : deduped) {
            knownIds.add(row.getId());
        }
        for (PageContent row : deduped) {
            String parentId = row.getParentId();
            if (StrUtil.isBlank(parentId) || ROOT_PARENT_ID.equals(parentId)) {
                topLevel.add(row);
            } else if (knownIds.contains(parentId)) {
                childrenByParent.computeIfAbsent(parentId, k -> new ArrayList<>()).add(row);
            } else {
                orphans.add(row.getId());
            }
        }
        if (!orphans.isEmpty()) {
            warnings.add(orphans.size() + " 个块的 parent_id 指向不存在的行，已丢弃: " + preview(orphans));
        }

        topLevel.sort(topLevelOrder());
        childrenByParent.values().forEach(list -> list.sort(siblingOrder()));

        topLevel = hoistSingleTitle(topLevel, warnings);

        List<Map<String, Object>> content = new ArrayList<>(topLevel.size());
        for (PageContent row : topLevel) {
            Set<String> visited = new HashSet<>();
            content.add(toNode(row, childrenByParent, visited, warnings));
            legacyRanks.put(row.getId(), rankKey(row));
        }

        Map<String, Object> doc = new LinkedHashMap<>();
        doc.put("type", "doc");
        doc.put("content", content);

        return new Reassembled(doc, legacyRanks, deduped.size(), content.size(), orphans, warnings);
    }

    /**
     * The sort key the legacy read path used for a top-level block: its stored
     * fractional rank if it has one, otherwise a key derived from the old integer
     * {@code sort_order}. Both live in the same base-36 space.
     */
    public static String rankKey(PageContent row) {
        String rank = row.getAttrs() != null ? row.getAttrs().getStr("rank") : null;
        if (StrUtil.isNotBlank(rank)) {
            return rank;
        }
        return FractionalIndex.fromLegacyOrder(row.getSortOrder() != null ? row.getSortOrder() : 0);
    }

    // ------------------------------------------------------------------
    // Node reconstruction
    // ------------------------------------------------------------------

    /**
     * Rebuild one row into a full ProseMirror node, subtree included.
     * <p>
     * The content of a node is the <b>merge</b> of what its own column held and
     * whatever child rows point at it — never one replacing the other. A node that
     * has both is the fingerprint of the old write path having split inline atoms
     * out of a container: the original interleaving of text and atoms was not
     * recorded anywhere, so it cannot be recovered. Such a page is reported rather
     * than quietly guessed at.
     * </p>
     */
    private static Map<String, Object> toNode(PageContent row, Map<String, List<PageContent>> childrenByParent,
            Set<String> visited, List<String> warnings) {
        Map<String, Object> node = new LinkedHashMap<>();
        node.put("type", row.getType());
        node.put("attrs", attrsWithId(row));

        if (!visited.add(row.getId())) {
            // parent_id cycle in corrupt data. Stop here rather than recursing
            // forever; the cycle is reported so it can be looked at.
            warnings.add("块 " + row.getId() + " 的 parent_id 构成环，子树在此截断");
            return node;
        }

        List<Map<String, Object>> stored = convertInline(row.getContent());
        List<PageContent> childRows = childrenByParent.getOrDefault(row.getId(), Collections.emptyList());

        List<Map<String, Object>> merged;
        if (childRows.isEmpty()) {
            merged = stored;
        } else if (stored.isEmpty()) {
            merged = new ArrayList<>(childRows.size());
            for (PageContent child : childRows) {
                merged.add(toNode(child, childrenByParent, visited, warnings));
            }
        } else {
            merged = mergeStoredWithChildRows(row, stored, childRows, childrenByParent, visited, warnings);
        }

        if (!merged.isEmpty()) {
            node.put("content", merged);
        }
        if (CollUtil.isNotEmpty(row.getMarks())) {
            node.put("marks", convertMarks(row.getMarks()));
        }
        if (row.getText() != null && isTextNode(row.getType())) {
            node.put("text", row.getText());
        }
        return node;
    }

    /**
     * Merge a node's stored inline content with its child rows, dropping child
     * rows that are already present inside the stored content.
     * <p>
     * Order: stored content first, then child rows in sibling order. This is a
     * choice, not a reconstruction — the old schema recorded a child row's index
     * among <em>block children only</em>, so its position relative to the text
     * around it was never persisted. The alternative was to discard one side, and
     * keeping both with a flag loses nothing that can be got back later.
     * </p>
     */
    private static List<Map<String, Object>> mergeStoredWithChildRows(PageContent row,
            List<Map<String, Object>> stored, List<PageContent> childRows,
            Map<String, List<PageContent>> childrenByParent, Set<String> visited, List<String> warnings) {
        Set<String> storedIds = new HashSet<>();
        for (Map<String, Object> child : stored) {
            String id = BlockDocCodec.readBlockId(child);
            if (StrUtil.isNotBlank(id)) {
                storedIds.add(id);
            }
        }

        List<Map<String, Object>> merged = new ArrayList<>(stored);
        int appended = 0;
        for (PageContent child : childRows) {
            if (storedIds.contains(child.getId())) {
                // The same block is both inside the parent's content column and a
                // row of its own. Keeping both would duplicate it; the copy is
                // dropped, never renamed.
                continue;
            }
            merged.add(toNode(child, childrenByParent, visited, warnings));
            appended++;
        }

        if (appended > 0) {
            String hint = INLINE_CONTENT_HOLDER_TYPES.contains(row.getType())
                    ? "（该类型的内容本应完整存在 content 列，出现子行说明是白名单守卫上线前写入的数据）"
                    : "";
            warnings.add("块 " + row.getId() + "（" + row.getType() + "）同时存在 content 内联内容与 " + appended
                    + " 个子行，两者的原始交错顺序未被记录，已按「内联在前、子行在后」拼接" + hint);
        }
        return merged;
    }

    /**
     * Convert stored inline children verbatim. These never had rows of their own,
     * so there is nothing to look up and nothing to merge — the column held the
     * whole thing.
     */
    private static List<Map<String, Object>> convertInline(List<PageContent> children) {
        if (CollUtil.isEmpty(children)) {
            return new ArrayList<>();
        }
        List<Map<String, Object>> out = new ArrayList<>(children.size());
        for (PageContent child : children) {
            if (child == null || StrUtil.isBlank(child.getType())) {
                continue;
            }
            Map<String, Object> node = new LinkedHashMap<>();
            node.put("type", child.getType());
            if (child.getAttrs() != null && !child.getAttrs().isEmpty()) {
                node.put("attrs", new LinkedHashMap<>(child.getAttrs()));
            }
            List<Map<String, Object>> grandChildren = convertInline(child.getContent());
            if (!grandChildren.isEmpty()) {
                node.put("content", grandChildren);
            }
            if (CollUtil.isNotEmpty(child.getMarks())) {
                node.put("marks", convertMarks(child.getMarks()));
            }
            if (child.getText() != null) {
                node.put("text", child.getText());
            }
            out.add(node);
        }
        return out;
    }

    private static List<Map<String, Object>> convertMarks(List<Mark> marks) {
        List<Map<String, Object>> out = new ArrayList<>(marks.size());
        for (Mark mark : marks) {
            if (mark == null || StrUtil.isBlank(mark.getType())) {
                continue;
            }
            Map<String, Object> node = new LinkedHashMap<>();
            node.put("type", mark.getType());
            if (mark.getAttrs() != null && !mark.getAttrs().isEmpty()) {
                node.put("attrs", new LinkedHashMap<>(mark.getAttrs()));
            }
            out.add(node);
        }
        return out;
    }

    /**
     * The row's attrs with {@code id} pinned to the primary key.
     * <p>
     * The PK is the authority: {@code attrs.id} can be missing on rows written
     * before the identity repair landed, and a node without an id makes the editor
     * mint a fresh one — which forks a duplicate block on the next save. Pinning
     * it here is assignment from the authoritative source, not regeneration.
     * </p>
     */
    private static Map<String, Object> attrsWithId(PageContent row) {
        JSONObject attrs = row.getAttrs();
        Map<String, Object> out = attrs != null ? new LinkedHashMap<>(attrs) : new LinkedHashMap<>();
        out.put("id", row.getId());
        return out;
    }

    private static boolean isTextNode(String type) {
        return "text".equals(type);
    }

    // ------------------------------------------------------------------
    // Ordering and convergence
    // ------------------------------------------------------------------

    private static Comparator<PageContent> topLevelOrder() {
        return Comparator.comparing(LegacyBlockReassembler::rankKey)
                .thenComparing(PageContent::getCreateTime, Comparator.nullsLast(Comparator.<LocalDateTime>naturalOrder()))
                .thenComparing(row -> row.getId() != null ? row.getId() : "");
    }

    private static Comparator<PageContent> siblingOrder() {
        return Comparator.comparingInt((PageContent row) -> row.getSortOrder() != null ? row.getSortOrder() : 0)
                .thenComparing(PageContent::getCreateTime, Comparator.nullsLast(Comparator.<LocalDateTime>naturalOrder()))
                .thenComparing(row -> row.getId() != null ? row.getId() : "");
    }

    /**
     * Collapse the root to exactly one title and put it first.
     * <p>
     * The editor schema is {@code doc = title block*}. Legacy data can hold
     * several title rows for one page — that was the visible symptom of the
     * concurrent-seeding race. Selection matches what the legacy read path showed
     * users, so migrating does not change which title survives.
     * </p>
     */
    private static List<PageContent> hoistSingleTitle(List<PageContent> topLevel, List<String> warnings) {
        List<PageContent> titles = new ArrayList<>();
        for (PageContent row : topLevel) {
            if (BlockDocCodec.TYPE_TITLE.equals(row.getType())) {
                titles.add(row);
            }
        }
        if (titles.isEmpty()) {
            return topLevel;
        }

        PageContent keep = titles.get(0);
        for (PageContent candidate : titles) {
            if (betterTitle(candidate, keep)) {
                keep = candidate;
            }
        }
        if (titles.size() > 1) {
            warnings.add("根级存在 " + titles.size() + " 个 title 块，保留 " + keep.getId() + "，其余丢弃");
        }

        Set<String> titleIds = new HashSet<>();
        for (PageContent row : titles) {
            titleIds.add(row.getId());
        }
        List<PageContent> ordered = new ArrayList<>(topLevel.size());
        ordered.add(keep);
        for (PageContent row : topLevel) {
            if (!titleIds.contains(row.getId())) {
                ordered.add(row);
            }
        }
        return ordered;
    }

    /** Non-empty text wins, then the most recent update, then the smallest id. */
    private static boolean betterTitle(PageContent candidate, PageContent incumbent) {
        boolean candidateHasText = StrUtil.isNotBlank(candidate.getText());
        boolean incumbentHasText = StrUtil.isNotBlank(incumbent.getText());
        if (candidateHasText != incumbentHasText) {
            return candidateHasText;
        }
        LocalDateTime candidateAt = candidate.getUpdateTime();
        LocalDateTime incumbentAt = incumbent.getUpdateTime();
        if (candidateAt != null && incumbentAt != null && !candidateAt.isEqual(incumbentAt)) {
            return candidateAt.isAfter(incumbentAt);
        }
        if (candidateAt != null && incumbentAt == null) {
            return true;
        }
        return StrUtil.compare(candidate.getId(), incumbent.getId(), true) < 0;
    }

    /**
     * One row per block id. The PK makes duplicates impossible today, but rows
     * predating it can still collide; the newest wins and the rest are dropped.
     */
    private static List<PageContent> dedupById(List<PageContent> rows, List<String> warnings) {
        Map<String, PageContent> byId = new LinkedHashMap<>();
        int dropped = 0;
        for (PageContent row : rows) {
            if (row == null || StrUtil.isBlank(row.getId()) || StrUtil.isBlank(row.getType())) {
                continue;
            }
            PageContent incumbent = byId.get(row.getId());
            if (incumbent == null) {
                byId.put(row.getId(), row);
                continue;
            }
            dropped++;
            if (newerRow(row, incumbent)) {
                byId.put(row.getId(), row);
            }
        }
        if (dropped > 0) {
            warnings.add("丢弃了 " + dropped + " 个重复 block_id 的旧行");
        }
        return new ArrayList<>(byId.values());
    }

    private static boolean newerRow(PageContent candidate, PageContent incumbent) {
        int candidateVersion = candidate.getVersion() != null ? candidate.getVersion() : 0;
        int incumbentVersion = incumbent.getVersion() != null ? incumbent.getVersion() : 0;
        if (candidateVersion != incumbentVersion) {
            return candidateVersion > incumbentVersion;
        }
        LocalDateTime candidateAt = candidate.getUpdateTime();
        LocalDateTime incumbentAt = incumbent.getUpdateTime();
        if (candidateAt != null && incumbentAt != null) {
            return candidateAt.isAfter(incumbentAt);
        }
        return candidateAt != null;
    }

    private static String preview(List<String> ids) {
        int limit = Math.min(ids.size(), 5);
        return String.join(", ", ids.subList(0, limit)) + (ids.size() > limit ? ", ..." : "");
    }

}
