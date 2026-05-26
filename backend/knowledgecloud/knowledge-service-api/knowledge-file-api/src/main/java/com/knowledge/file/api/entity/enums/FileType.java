package com.knowledge.file.api.entity.enums;

import com.knowledge.core.common.base.BaseEnum;

import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public enum FileType implements BaseEnum<String> {

    FILE("FILE", "文件"),
    FOLDER("FOLDER", "文件夹");

    private final String value;
    private final String desc;

}
