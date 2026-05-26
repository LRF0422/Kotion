package com.knowledge.core.common.base;

import java.io.Serializable;

import lombok.Data;

@Data
public class Icon implements Serializable {

    private String icon;
    private IconType type;

}
