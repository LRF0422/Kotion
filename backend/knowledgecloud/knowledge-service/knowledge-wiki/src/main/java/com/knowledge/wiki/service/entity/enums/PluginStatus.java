package com.knowledge.wiki.service.entity.enums;

import com.knowledge.core.common.base.BaseEnum;

import lombok.AllArgsConstructor;
import lombok.Getter;

@AllArgsConstructor
@Getter
public enum PluginStatus implements BaseEnum<String> {

    PENDING("PENDING", "待审核"),
    IN_PROGRESS("IN_PROGRESS", "审核中"),
    REJECTED("REJECTED", "审核未通过"),
    DONE("DONE", "审核通过");

    private final String value;
    private final String desc;

}
