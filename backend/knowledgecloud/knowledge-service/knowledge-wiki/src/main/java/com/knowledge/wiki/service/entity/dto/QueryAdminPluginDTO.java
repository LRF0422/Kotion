package com.knowledge.wiki.service.entity.dto;

import com.knowledge.core.common.base.PageDTO;
import com.knowledge.wiki.service.entity.enums.PluginCategory;
import com.knowledge.wiki.service.entity.enums.PluginStatus;

import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * 后台插件审核查询 DTO。
 */
@Data
@EqualsAndHashCode(callSuper = true)
public class QueryAdminPluginDTO extends PageDTO {

    private PluginCategory category;

    /**
     * 候选版本优先的有效审核状态。
     */
    private PluginStatus reviewStatus;
}
