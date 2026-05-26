package com.knowledge.wiki.service.entity.dto;

import com.knowledge.core.common.base.PageDTO;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * Query page version history
 */
@Data
@EqualsAndHashCode(callSuper = true)
public class QueryPageVersionDTO extends PageDTO {

    private Long pageId;
    private String status;
    private Long createUser;

}
