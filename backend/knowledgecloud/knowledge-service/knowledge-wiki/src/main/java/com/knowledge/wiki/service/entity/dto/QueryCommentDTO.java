package com.knowledge.wiki.service.entity.dto;

import com.knowledge.core.common.base.PageDTO;

import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * Query DTO for global comment list (admin)
 */
@Data
@EqualsAndHashCode(callSuper = true)
public class QueryCommentDTO extends PageDTO {

    /**
     * Filter by resolved status (null = all)
     */
    private Boolean resolved;

    /**
     * Filter by page ID (null = all pages)
     */
    private Long pageId;

}
