package com.knowledge.wiki.service.entity.enums;

import com.knowledge.core.common.base.BaseEnum;

import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public enum PluginReportStatus implements BaseEnum<String> {

    PENDING("PENDING", "待处理"),
    RESOLVED("RESOLVED", "已处理"),
    REJECTED("REJECTED", "已驳回");

    private final String value;
    private final String desc;
}
