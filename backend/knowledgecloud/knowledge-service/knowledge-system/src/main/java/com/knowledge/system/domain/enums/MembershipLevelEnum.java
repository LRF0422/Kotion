package com.knowledge.system.domain.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 会员等级枚举
 *
 * @author Qwen
 */
@Getter
@AllArgsConstructor
public enum MembershipLevelEnum {

    /**
     * 基础会员
     */
    BASIC("BASIC", "基础会员"),

    /**
     * 专业会员
     */
    PRO("PRO", "专业会员");

    private final String code;
    private final String desc;

    /**
     * 根据编码获取枚举
     */
    public static MembershipLevelEnum fromCode(String code) {
        for (MembershipLevelEnum level : values()) {
            if (level.getCode().equals(code)) {
                return level;
            }
        }
        return null;
    }
}