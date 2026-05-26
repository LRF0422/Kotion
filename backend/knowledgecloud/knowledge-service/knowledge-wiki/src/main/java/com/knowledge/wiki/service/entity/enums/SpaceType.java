package com.knowledge.wiki.service.entity.enums;

import com.knowledge.core.common.base.BaseEnum;

import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public enum SpaceType implements BaseEnum<String> {

    TEMPALTE("TEMPLATE", "模板"),
    PERSONAL("PERSONAL", "个人的"),
    SPACE("SPACE", "正常的空间"),
    INNER("INNER", "系统自带空间"),
    JOURNAL("JOURNAL",""),
    COLLABORATION("COLLABORATION", "协作空间");

    private final String value;
    private final String desc;

}
