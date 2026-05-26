package com.knowledge.wiki.service.entity.dto;

import com.knowledge.core.common.base.PageDTO;
import com.knowledge.wiki.service.entity.enums.PluginCategory;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
public class QueryPluginDTO extends PageDTO {

    private PluginCategory category;

}
