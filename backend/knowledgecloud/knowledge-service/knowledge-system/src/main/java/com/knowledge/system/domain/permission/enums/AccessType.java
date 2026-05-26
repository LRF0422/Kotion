package com.knowledge.system.domain.permission.enums;

import com.knowledge.core.common.base.BaseEnum;

import lombok.AllArgsConstructor;
import lombok.Getter;

@AllArgsConstructor
@Getter
public enum AccessType implements BaseEnum<String> {

    ADMIN("ADMIN", "管理员"),
    READ("READ", "读"),
    WRITE("WRITE", "写"),
    READ_WRITE("READ_WRITE", "读写");

    private final String value;
    private final String desc;

}
