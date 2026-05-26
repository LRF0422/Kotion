package com.knowledge.core.message.core.message;

import lombok.AllArgsConstructor;
import lombok.Getter;

@AllArgsConstructor
@Getter
public enum MessageType {
    MP("MP", "微信公众号消息"),
    MA("MA", "微信小程序消息"),
    STANDARD("STANDARD", "标准消息"),
    SSE("SSE", ""),
    EMAIL("EMAIL", "邮件");

    private final String value;
    private final String desc;
}
