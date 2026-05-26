package com.knowledge.wiki.service.entity.enums;

import com.knowledge.core.common.base.BaseEnum;

import lombok.AllArgsConstructor;
import lombok.Getter;

@AllArgsConstructor
@Getter
public enum InstalledPluginStatus implements BaseEnum<String> {

    ACTIVE("ACTIVE", "激活"),
    DISABLED("DISABLED", "禁用"),
    UNINSTALLED("UNINSTALLED", "已卸载");

    private final String value;
    private final String desc;

}
