package com.knowledge.wiki.service.entity;

import java.time.LocalDateTime;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

import lombok.Data;

/**
 * One accepted op batch. Append-only — this table <i>is</i> the page history.
 * <p>
 * {@link #ops} stores the ops <b>as arbitrated by the server</b>, not the
 * client's raw request: ranks already resolved, delete cascades already
 * expanded. Replay is therefore deterministic and never has to re-run
 * resolution logic that may since have changed.
 * </p>
 */
@Data
@TableName("wiki_page_op")
public class PageOp {

    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    private Long pageId;

    /**
     * The rev this batch produced.
     */
    private Long rev;

    private Long actor;

    /**
     * Normalised op array, as a JSON string.
     */
    private String ops;

    /**
     * Client-supplied batch key that makes a retry a lookup instead of a second
     * application. {@code null} opts out of deduplication, which is what
     * server-side writers do.
     */
    private String idempotencyKey;

    private LocalDateTime createdAt;

}
