package com.knowledge.wiki.service.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

import lombok.Data;

/**
 * Authoritative current state of one addressable block.
 * <p>
 * {@link #node} holds the block's <b>complete</b> ProseMirror subtree, inline
 * content included, and is returned verbatim on read. Nothing is ever
 * reassembled from child rows — that reassembly is what used to destroy the
 * inline content of container nodes.
 * </p>
 * <p>
 * Deliberately <b>not</b> a {@code TenantEntity}: that base class contributes
 * {@code create_user} / {@code create_time} / {@code update_user} /
 * {@code update_time} and a {@code @TableLogic is_deleted}, none of which exist
 * on {@code wiki_block}. Soft deletion would also be wrong here — a deleted
 * block is really gone from current state, and its history lives in
 * {@code wiki_page_op}, not in a tombstone.
 * </p>
 */
@Data
@TableName(value = "wiki_block", autoResultMap = true)
public class WikiBlock {

    /**
     * Frontend-generated, stable for the block's whole life. Never regenerated:
     * comments, block references, the search index, AI addressing and journal
     * replay all key off it.
     */
    @TableId(value = "block_id", type = IdType.INPUT)
    private String blockId;

    private Long pageId;

    /**
     * Parent block id; the empty string means top level (never {@code null} —
     * a nullable column would silently escape the sibling-rank unique key).
     */
    private String parentId;

    /**
     * Fractional index — the only authority on sibling order. Server-assigned.
     * <p>
     * Column is {@code block_rank}, not {@code rank}: {@code RANK} is a reserved
     * word in MySQL 8.0 and the ORM does not quote generated identifiers.
     * </p>
     */
    private String blockRank;

    private String type;

    /**
     * The block's complete PM subtree as a JSON string. Kept as a raw string
     * rather than a parsed tree so a read-modify-write cycle cannot silently
     * reorder keys or drop attributes the backend doesn't model.
     */
    private String node;

    /**
     * Hash of {@link #node}, so an unchanged block can be skipped without
     * loading and comparing the JSON itself.
     */
    private String nodeHash;

    /**
     * Derived plain text. For search and diff only — never a source of truth.
     */
    private String text;

    /**
     * Page rev at which this row last changed.
     */
    private Long rev;

}
