package com.knowledge.wiki.service.entity.enums;

import com.knowledge.core.common.base.BaseEnum;

import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public enum PluginReportReason implements BaseEnum<String> {

    MALICIOUS("MALICIOUS", "恶意代码或行为"),
    PRIVACY("PRIVACY", "隐私与数据问题"),
    COPYRIGHT("COPYRIGHT", "侵权或抄袭"),
    SPAM("SPAM", "垃圾或误导信息"),
    OTHER("OTHER", "其他");

    private final String value;
    private final String desc;
}
