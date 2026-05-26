package com.knowledge.wiki.service.entity.dto;

import com.knowledge.wiki.service.entity.enums.PageStatus;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
public class QueryPageDTO extends com.knowledge.core.common.base.PageDTO {

    private PageStatus status;

    private Long spaceId;

}
