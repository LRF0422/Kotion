package com.knowledge.wiki.service.entity.vo;

import java.io.Serializable;

import lombok.Data;

/**
 * A directed page-to-page reference edge in the relation graph
 * (source page references target page). Ids are strings to preserve
 * snowflake precision — see {@link GraphNodeVO}.
 */
@Data
public class GraphEdgeVO implements Serializable {

    /** Source page id (as string). */
    private String source;

    /** Target page id (as string). */
    private String target;

    /** Link kind, e.g. NORMAL / MENTION / EMBED. */
    private String linkKind;
}
