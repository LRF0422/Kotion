package com.knowledge.wiki.service.entity.enums;

import com.knowledge.core.common.base.BaseEnum;

import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public enum SpaceStatus implements BaseEnum<String> {
    
    ACTIVE("ACTIVE","激活的"),
    IN_ACTIVE("IN_ACTIVE","禁用");
    
    private String value;
    private String desc;
}
