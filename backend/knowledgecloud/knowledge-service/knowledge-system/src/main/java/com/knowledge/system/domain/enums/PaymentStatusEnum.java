package com.knowledge.system.domain.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 支付状态枚举
 *
 * @author Qwen
 */
@Getter
@AllArgsConstructor
public enum PaymentStatusEnum {

    /**
     * 成功
     */
    SUCCESS("SUCCESS", "成功"),

    /**
     * 失败
     */
    FAILED("FAILED", "失败"),

    /**
     * 处理中
     */
    PROCESSING("PROCESSING", "处理中");

    private final String code;
    private final String desc;

    /**
     * 根据编码获取枚举
     */
    public static PaymentStatusEnum fromCode(String code) {
        for (PaymentStatusEnum status : values()) {
            if (status.getCode().equals(code)) {
                return status;
            }
        }
        return null;
    }
}