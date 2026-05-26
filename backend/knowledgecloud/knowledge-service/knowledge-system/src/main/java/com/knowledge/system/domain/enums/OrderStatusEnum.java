package com.knowledge.system.domain.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 订单状态枚举
 *
 * @author Qwen
 */
@Getter
@AllArgsConstructor
public enum OrderStatusEnum {

    /**
     * 待支付
     */
    PENDING("PENDING", "待支付"),

    /**
     * 已支付
     */
    PAID("PAID", "已支付"),

    /**
     * 已取消
     */
    CANCELLED("CANCELLED", "已取消"),

    /**
     * 已过期
     */
    EXPIRED("EXPIRED", "已过期");

    private final String code;
    private final String desc;

    /**
     * 根据编码获取枚举
     */
    public static OrderStatusEnum fromCode(String code) {
        for (OrderStatusEnum status : values()) {
            if (status.getCode().equals(code)) {
                return status;
            }
        }
        return null;
    }
}