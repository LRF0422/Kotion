package com.knowledge.message.domain.enums;

import com.knowledge.core.common.base.BaseEnum;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * Instant Message Status Enum
 */
@Getter
@AllArgsConstructor
public enum InstantMessageStatus implements BaseEnum<String> {

    /**
     * Message has been sent and stored
     */
    SENT("SENT", "已发送"),

    /**
     * Message has been delivered to receiver's client
     */
    DELIVERED("DELIVERED", "已送达"),

    /**
     * Message has been read by receiver
     */
    READ("READ", "已读");

    private final String value;
    private final String desc;
}
