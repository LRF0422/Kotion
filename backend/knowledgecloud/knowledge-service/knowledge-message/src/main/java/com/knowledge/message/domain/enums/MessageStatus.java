package com.knowledge.message.domain.enums;

import com.knowledge.core.common.base.BaseEnum;
import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public enum MessageStatus implements BaseEnum<String> {

    READ("READ", "已读"),
    UNREAD("UNREAD", "未读");

    private final String value;
    private final String desc;
}
