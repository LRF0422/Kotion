package com.knowledge.wiki.service.entity.dto;

import com.knowledge.core.common.base.PageDTO;

import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * DTO for querying block version history with pagination.
 */
@Data
@EqualsAndHashCode(callSuper = true)
public class QueryBlockVersionDTO extends PageDTO {

    /**
     * Block ID (query history for a specific block)
     */
    private String blockId;

    /**
     * Page ID (query all block versions for a page)
     */
    private Long pageId;

    /**
     * Page version ID (query all block snapshots at a specific page version)
     */
    private Long pageVersionId;

    /**
     * Page version number (query block snapshots by page version number)
     */
    private String pageVersion;

    /**
     * Block type filter
     */
    private String type;

}
