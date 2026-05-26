package com.knowledge.system.domain.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 订阅类型枚举
 *
 * @author Qwen
 */
@Getter
@AllArgsConstructor
public enum SubscriptionTypeEnum {

    /**
     * 月付
     */
    MONTHLY("MONTHLY", "月付"),

    /**
     * 年付
     */
    YEARLY("YEARLY", "年付");

    private final String code;
    private final String desc;

    /**
     * 根据编码获取枚举
     */
    public static SubscriptionTypeEnum fromCode(String code) {
        for (SubscriptionTypeEnum type : values()) {
            if (type.getCode().equals(code)) {
                return type;
            }
        }
        return null;
    }
}