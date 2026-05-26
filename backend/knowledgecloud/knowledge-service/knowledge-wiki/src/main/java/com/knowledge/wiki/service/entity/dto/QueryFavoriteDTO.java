package com.knowledge.wiki.service.entity.dto;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
public class QueryFavoriteDTO extends com.knowledge.core.common.base.PageDTO {

    private String scope;

}
