package com.knowledge.wiki.service.entity.enums;

import com.knowledge.core.common.base.BaseEnum;

import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public enum PagePermissionEnum implements BaseEnum<String> {

    READ("READ", "读"),
    WRITE("WRITE", "写");

    private final String value;
    private final String desc;

}
