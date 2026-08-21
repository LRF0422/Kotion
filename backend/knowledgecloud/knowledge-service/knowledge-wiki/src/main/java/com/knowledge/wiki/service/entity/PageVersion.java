package com.knowledge.wiki.service.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.knowledge.core.version.BaseVersion;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("wiki_page_version")
public class PageVersion extends BaseVersion {

    /**
     * Sealed by an incremental save. Such a version stays "open": subsequent
     * autosaves from the same author within the coalescing window are absorbed
     * into it instead of each sealing its own version.
     */
    public static final String SEAL_AUTOSAVE = "AUTOSAVE";

    /**
     * Sealed by an explicit user save or a bulk import. Closed on creation —
     * never absorbed into, so it stays identifiable in the history list.
     */
    public static final String SEAL_CHECKPOINT = "CHECKPOINT";

    /**
     * Sealed by a version rollback. Closed on creation for the same reason.
     */
    public static final String SEAL_ROLLBACK = "ROLLBACK";

    private String md5Code;
    private Long parentId;
    private String title;
    private String changeSummary;

    /**
     * How this version was sealed — one of {@link #SEAL_AUTOSAVE},
     * {@link #SEAL_CHECKPOINT}, {@link #SEAL_ROLLBACK}. Only
     * {@code AUTOSAVE} versions can absorb further autosaves.
     */
    private String sealKind;

}
