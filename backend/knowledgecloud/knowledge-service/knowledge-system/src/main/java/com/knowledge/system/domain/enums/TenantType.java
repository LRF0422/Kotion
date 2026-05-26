package com.knowledge.system.domain.enums;

import com.knowledge.core.common.base.BaseEnum;

import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public enum TenantType implements BaseEnum<String> {

    INDIVIDUAL("INDIVIDUAL", "独立用户"),
    TEAM("TEAM", "团队用户");

    private final String value;
    private final String desc;

}
