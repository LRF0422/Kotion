package com.knowledge.wiki.service.doc;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

import com.knowledge.wiki.service.entity.WikiBlock;

import cn.hutool.core.util.StrUtil;
import lombok.Getter;
import lombok.Setter;

/**
 * A page's block structure, loaded once per write batch and mutated in memory as
 * ops are applied.
 * <p>
 * Two reasons this exists rather than each op querying the database:
 * </p>
 * <ul>
 * <li><b>Rank generation must see the batch's own effects.</b> Two inserts after
 * the same anchor in one batch have to land at two different ranks. Resolving
 * both against the on-disk state would produce the same rank twice and trip the
 * sibling unique key.</li>
 * <li>Sibling groups are held in a {@link TreeMap} keyed by rank, so "the block
 * after this one" is a navigation instead of a sort — which is what
 * {@code after} / {@code before} / {@code firstChild} / {@code lastChild} all
 * reduce to.</li>
 * </ul>
 * <p>
 * Because a generated rank always falls strictly between two ranks that are
 * adjacent in the map, it can never equal a rank already in use. That is what
 * lets the whole batch be flushed without ordering the statements to dodge
 * transient unique-key violations — the renumbering problem simply does not
 * arise.
 * </p>
 * <p>
 * Node content is deliberately absent: this index carries only the metadata the
 * engine needs to validate and order. Loading every block's JSON to apply a
 * one-block edit would make the cost of a save proportional to page size.
 * </p>
 */
public final class PageBlockIndex {

    /**
     * Metadata for one block. Mutable — a move rewrites {@code parentId} and
     * {@code blockRank} in place.
     */
    @Getter
    @Setter
    public static final class Meta {

        private String blockId;

        private String parentId;

        private String blockRank;

        private String type;

        private String nodeHash;

        private long rev;

        public Meta(String blockId, String parentId, String blockRank, String type, String nodeHash, long rev) {
            this.blockId = blockId;
            this.parentId = normaliseParent(parentId);
            this.blockRank = blockRank;
            this.type = type;
            this.nodeHash = nodeHash;
            this.rev = rev;
        }
    }

    private final Map<String, Meta> byId = new HashMap<>();

    /** parentId -> (rank -> block), ordered by rank. */
    private final Map<String, TreeMap<String, Meta>> siblingsByParent = new HashMap<>();

    public static PageBlockIndex of(List<WikiBlock> rows) {
        PageBlockIndex index = new PageBlockIndex();
        for (WikiBlock row : rows) {
            index.add(new Meta(row.getBlockId(), row.getParentId(), row.getBlockRank(), row.getType(),
                    row.getNodeHash(), row.getRev() == null ? 0L : row.getRev()));
        }
        return index;
    }

    /** {@code null} becomes the empty string: top level is never null. */
    public static String normaliseParent(String parentId) {
        return StrUtil.isBlank(parentId) ? BlockDocCodec.TOP_LEVEL : parentId;
    }

    public Meta get(String blockId) {
        return blockId == null ? null : byId.get(blockId);
    }

    public boolean contains(String blockId) {
        return blockId != null && byId.containsKey(blockId);
    }

    public int size() {
        return byId.size();
    }

    /** Every block id currently in the index. */
    public Set<String> allIds() {
        return new HashSet<>(byId.keySet());
    }

    /** Children of {@code parentId} in rank order. */
    public List<Meta> children(String parentId) {
        TreeMap<String, Meta> tree = siblingsByParent.get(normaliseParent(parentId));
        return tree == null ? new ArrayList<>() : new ArrayList<>(tree.values());
    }

    public void add(Meta meta) {
        byId.put(meta.getBlockId(), meta);
        tree(meta.getParentId()).put(meta.getBlockRank(), meta);
    }

    public void remove(String blockId) {
        Meta meta = byId.remove(blockId);
        if (meta != null) {
            tree(meta.getParentId()).remove(meta.getBlockRank());
        }
    }

    /** Re-place an existing block at a new parent and rank. */
    public void relocate(Meta meta, String parentId, String rank) {
        tree(meta.getParentId()).remove(meta.getBlockRank());
        meta.setParentId(normaliseParent(parentId));
        meta.setBlockRank(rank);
        tree(meta.getParentId()).put(rank, meta);
    }

    /**
     * A rank that places a block at {@code pos} relative to its anchor.
     * <p>
     * Generated strictly between the two ranks that currently bracket the target
     * slot, so no existing sibling has to be touched.
     * </p>
     *
     * @return the rank, or {@code null} when the anchor is unusable
     */
    public String resolveRank(String parentId, String pos, Meta anchor) {
        TreeMap<String, Meta> tree = tree(normaliseParent(parentId));
        switch (pos == null ? "" : pos) {
            case "firstChild":
                return FractionalIndex.keyBetween(null, tree.isEmpty() ? null : tree.firstKey());
            case "lastChild":
                return FractionalIndex.keyBetween(tree.isEmpty() ? null : tree.lastKey(), null);
            case "after": {
                if (anchor == null) {
                    return null;
                }
                String ref = anchor.getBlockRank();
                return FractionalIndex.keyBetween(ref, tree.higherKey(ref));
            }
            case "before": {
                if (anchor == null) {
                    return null;
                }
                String ref = anchor.getBlockRank();
                return FractionalIndex.keyBetween(tree.lowerKey(ref), ref);
            }
            default:
                return null;
        }
    }

    /**
     * Whether {@code candidateId} is {@code blockId} itself or one of its
     * descendants. Guards a move from making a block its own ancestor, which would
     * detach the whole subtree from the document while leaving its rows in place.
     */
    public boolean isSelfOrDescendant(String blockId, String candidateId) {
        String cursor = normaliseParent(candidateId);
        int guard = 0;
        while (!BlockDocCodec.TOP_LEVEL.equals(cursor)) {
            if (cursor.equals(blockId)) {
                return true;
            }
            Meta meta = byId.get(cursor);
            if (meta == null || ++guard > byId.size() + 1) {
                // Missing parent or an existing cycle: not this move's problem, and
                // the guard stops a corrupt chain from spinning forever.
                return false;
            }
            cursor = meta.getParentId();
        }
        return false;
    }

    /**
     * {@code blockId} plus every descendant, parents before children.
     * <p>
     * A delete is expanded here rather than left to a database cascade so the
     * expansion is what gets written to the journal — replay then reproduces
     * exactly the same set of rows without re-deriving it from a tree that has
     * since changed.
     * </p>
     */
    public List<String> selfAndDescendants(String blockId) {
        List<String> out = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        Deque<String> queue = new ArrayDeque<>();
        queue.add(blockId);
        while (!queue.isEmpty()) {
            String current = queue.poll();
            if (!seen.add(current)) {
                continue;
            }
            out.add(current);
            for (Meta child : children(current)) {
                queue.add(child.getBlockId());
            }
        }
        return out;
    }

    private TreeMap<String, Meta> tree(String parentId) {
        return siblingsByParent.computeIfAbsent(normaliseParent(parentId), k -> new TreeMap<>());
    }

}
