package com.knowledge.wiki.service.entity.vo;

import java.io.Serializable;

import com.knowledge.core.common.base.Icon;

import lombok.Data;

/**
 * A single page node in the cross-space relation graph.
 *
 * <p>All ids are serialized as {@link String}: page/space ids are 19-digit
 * snowflakes that exceed JS {@code Number.MAX_SAFE_INTEGER}; sending them as
 * numbers would corrupt the last digits and break navigation on the frontend.
 */
@Data
public class GraphNodeVO implements Serializable {

    /** Page id (snowflake, as string). */
    private String id;

    /** Page title. */
    private String title;

    /** Space the page belongs to (as string). */
    private String spaceId;

    /** Display name of the page's space (for the graph legend). */
    private String spaceName;

    /** Page icon, if any. */
    private Icon icon;

    /** Page status (ACTIVE / DRAFT). */
    private String status;
}
