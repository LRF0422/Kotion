package com.knowledge.wiki.service.entity.dto;

import com.knowledge.core.common.base.PageDTO;
import com.knowledge.wiki.service.entity.enums.PluginReportStatus;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
public class QueryPluginReportDTO extends PageDTO {

    private PluginReportStatus status;
    private Long pluginId;
}
