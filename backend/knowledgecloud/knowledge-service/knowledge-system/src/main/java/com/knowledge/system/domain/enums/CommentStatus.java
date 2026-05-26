package com.knowledge.system.domain.enums;

import com.knowledge.core.common.base.BaseEnum;

import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public enum CommentStatus implements BaseEnum<String> {

    RESLOVED("RESLOVED", "已解决");

    private final String value;
    private final String desc;

}
