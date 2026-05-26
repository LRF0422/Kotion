package com.knowledge.wiki.service.entity.enums;

import com.knowledge.core.common.base.BaseEnum;

import lombok.AllArgsConstructor;
import lombok.Getter;

@AllArgsConstructor
@Getter
public enum PageStatus implements BaseEnum<String> {

    DRAFT("DRAFT", "草稿"),
    ACTIVE("ACTIVE", "激活"),
    TRASH("TRASH", "回收中"),
    DELETED("DELETED", "已删除");

    private final String value;
    private final String desc;

}
