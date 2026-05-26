package com.knowledge.core.version;

import com.knowledge.core.common.base.BaseEnum;

import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public enum VersionStatus implements BaseEnum<String> {

    ACTIVE("ACTIVE", "激活"),
    DRAFT("DRAFT", "草稿"),
    PENDING("PENDING", "挂起"),
    IN_ACTIVE("IN_ACTIVE", "失效");

    private final String value;
    private final String desc;

}
