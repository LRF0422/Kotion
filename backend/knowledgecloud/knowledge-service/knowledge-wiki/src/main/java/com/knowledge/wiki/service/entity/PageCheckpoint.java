package com.knowledge.wiki.service.entity;

import java.time.LocalDateTime;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

import lombok.Data;

/**
 * Materialised full-document snapshot at one rev. Bounds replay cost.
 * <p>
 * Restoring to an arbitrary rev {@code R} means: load the nearest checkpoint at
 * {@code rev <= R}, then replay the ops in {@code (checkpoint.rev, R]}. The
 * checkpoint cadence is what makes that interval bounded by construction rather
 * than by hope.
 * </p>
 */
@Data
@TableName("wiki_page_checkpoint")
public class PageCheckpoint {

    /**
     * Written by an autosave cadence (every {@code CHECKPOINT_OP_INTERVAL} ops).
     */
    public static final String KIND_AUTO = "AUTO";

    /**
     * Written by an explicit user save.
     */
    public static final String KIND_USER = "USER";

    /**
     * Written by a version restore, so the restore itself is a navigable point.
     */
    public static final String KIND_RESTORE = "RESTORE";

    /**
     * Written by an import or by the one-time backfill from the legacy tables.
     */
    public static final String KIND_IMPORT = "IMPORT";

    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    private Long pageId;

    private Long rev;

    /**
     * One of {@link #KIND_AUTO}, {@link #KIND_USER}, {@link #KIND_RESTORE},
     * {@link #KIND_IMPORT}.
     */
    private String kind;

    private String label;

    /**
     * Whole-document JSON, deflate-compressed. Stored compressed because these
     * rows accumulate and are only ever read one at a time.
     */
    private byte[] doc;

    private Integer blockCount;

    private Long actor;

    /** Original revision selected by a forward restore checkpoint. */
    private Long sourceRev;

    private LocalDateTime createdAt;

}
