package com.knowledge.wiki.service.entity.enums;

import com.knowledge.core.common.base.BaseEnum;

import lombok.AllArgsConstructor;
import lombok.Getter;

@AllArgsConstructor
@Getter
public enum InvitationStatus implements BaseEnum<String> {

    PENDING("PENDING", "待处理"),
    ACCEPTED("ACCEPTED", "已接受"),
    REJECTED("REJECTED", "已拒绝"),
    EXPIRED("EXPIRED", "已过期");

    private final String value;
    private final String desc;

}
