package com.knowledge.wiki.service.entity.enums;

import com.knowledge.core.common.base.BaseEnum;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * Space Visibility Enum
 * Controls who can discover and access the space
 */
@Getter
@AllArgsConstructor
public enum SpaceVisibility implements BaseEnum<String> {

    PUBLIC("PUBLIC", "公开空间，所有人可见"),
    PRIVATE("PRIVATE", "私密空间，仅成员可见");

    private final String value;
    private final String desc;

}
