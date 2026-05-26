package com.knowledge.system.domain.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 支付方式枚举
 *
 * @author Qwen
 */
@Getter
@AllArgsConstructor
public enum PaymentMethodEnum {

    /**
     * 微信扫码支付
     */
    WECHAT_QR("WECHAT_QR", "微信扫码"),

    /**
     * 支付宝扫码支付
     */
    ALIPAY_QR("ALIPAY_QR", "支付宝扫码");

    private final String code;
    private final String desc;

    /**
     * 根据编码获取枚举
     */
    public static PaymentMethodEnum fromCode(String code) {
        for (PaymentMethodEnum method : values()) {
            if (method.getCode().equals(code)) {
                return method;
            }
        }
        return null;
    }
}