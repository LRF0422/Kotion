package com.knowledge.wiki.service.entity.enums;

import com.knowledge.core.common.base.BaseEnum;

import lombok.AllArgsConstructor;
import lombok.Getter;

@AllArgsConstructor
@Getter
public enum PluginCategory implements BaseEnum<String> {

    FEATURE("FEATURE", "功能"),
    APP("APP", "应用"),
    CONNECTOR("CONNECTOR", "连接器");

    private String value;
    private String desc;

}
