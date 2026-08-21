package com.knowledge.wiki.service.entity.dto;

import java.util.Map;

import lombok.Data;

/**
 * One unit of intent from a writer. Clients submit ops, never state.
 * <p>
 * Position is expressed as an <b>anchor plus a relation</b> ({@link #pos} +
 * {@link #refBlockId}), never as a rank. The server resolves that into a rank.
 * Two consequences, both deliberate: a server-side writer (AI, import, restore)
 * needs no rank implementation at all, and no external caller can write a rank
 * that violates sibling ordering.
 * </p>
 */
@Data
public class BlockOpDTO {

    public static final String OP_INSERT = "insert";

    public static final String OP_REPLACE = "replace";

    public static final String OP_MOVE = "move";

    public static final String OP_DELETE = "delete";

    /** Relative to {@link #refBlockId}. */
    public static final String POS_AFTER = "after";

    /** Relative to {@link #refBlockId}. */
    public static final String POS_BEFORE = "before";

    /** Relative to {@link #parentId}; {@link #refBlockId} is ignored. */
    public static final String POS_FIRST_CHILD = "firstChild";

    /**
     * Relative to {@link #parentId}. Present so an appending writer does not have
     * to know which block is currently last — importers and AI writers don't.
     */
    public static final String POS_LAST_CHILD = "lastChild";

    /**
     * One of {@link #OP_INSERT}, {@link #OP_REPLACE}, {@link #OP_MOVE},
     * {@link #OP_DELETE}.
     */
    private String op;

    private String blockId;

    /**
     * Target parent; {@code null} or empty means top level. For
     * {@link #POS_AFTER} / {@link #POS_BEFORE} it is validated against the
     * anchor's actual parent rather than trusted.
     */
    private String parentId;

    /**
     * One of {@link #POS_AFTER}, {@link #POS_BEFORE}, {@link #POS_FIRST_CHILD},
     * {@link #POS_LAST_CHILD}. Required for {@code insert} and {@code move}.
     */
    private String pos;

    /**
     * Anchor block for {@link #POS_AFTER} / {@link #POS_BEFORE}.
     */
    private String refBlockId;

    /**
     * The block's complete subtree. Required for {@code insert} and
     * {@code replace}; ignored otherwise — a move never carries content, which is
     * the whole point of it being a separate op.
     */
    private Map<String, Object> node;

    /**
     * Optional per-block optimistic check: the rev the writer believes this block
     * is at. Beaten by a newer rev, the op comes back {@code stale} instead of
     * overwriting.
     */
    private Long expectRev;

}
