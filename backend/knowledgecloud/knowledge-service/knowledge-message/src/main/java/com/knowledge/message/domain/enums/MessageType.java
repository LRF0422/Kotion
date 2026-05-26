package com.knowledge.message.domain.enums;

import com.knowledge.core.common.base.BaseEnum;
import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public enum MessageType implements BaseEnum<String> {
    NOTICE("NOTICE", "通知"),
    TODO("TODO", "代办"),
    MESSAGE("MESSAGE", "消息"),
    OTHER("OTHER", "其他");

    private final String value;
    private final String desc;

}
