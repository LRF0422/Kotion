package com.knowledge.system.domain.enums;

import com.knowledge.core.common.base.BaseEnum;

import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public enum AppType implements BaseEnum<String> {


    BASE("BASE", "基础"),
    PLANNING("PLANNING", "计划、跟踪和支持");


    private final String value;
    private final String desc;
    
}
