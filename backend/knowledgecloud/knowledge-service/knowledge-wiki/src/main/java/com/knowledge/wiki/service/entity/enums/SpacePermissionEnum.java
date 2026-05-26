package com.knowledge.wiki.service.entity.enums;

import com.knowledge.core.common.base.BaseEnum;

import lombok.AllArgsConstructor;
import lombok.Getter;

@AllArgsConstructor
@Getter
public enum SpacePermissionEnum implements BaseEnum<String> {

    READ("READ", "读"),
    WRITE("WRITE", "写"),
    ADMIN("ADMIN", "管理员");

    private final String value;
    private final String desc;

}
