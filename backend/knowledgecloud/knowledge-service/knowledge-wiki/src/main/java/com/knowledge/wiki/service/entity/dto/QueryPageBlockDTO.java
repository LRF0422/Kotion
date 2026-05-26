package com.knowledge.wiki.service.entity.dto;

import com.knowledge.core.common.base.PageDTO;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
public class QueryPageBlockDTO extends PageDTO {

    private Long pageId;
    private String type;
    private Long spaceId;

}
