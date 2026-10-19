package com.knowledge.system.domain.enums;

import com.knowledge.core.common.base.BaseEnum;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 开发者认证提交的证件 / 资质类型。
 */
@Getter
@AllArgsConstructor
public enum DeveloperIdType implements BaseEnum<String> {

    ID_CARD("ID_CARD", "身份证"),
    PASSPORT("PASSPORT", "护照"),
    BUSINESS_LICENSE("BUSINESS_LICENSE", "营业执照"),
    OTHER("OTHER", "其他证件");

    private final String value;
    private final String desc;
}
