package com.knowledge.system.vo;

import java.io.Serializable;

import lombok.Data;

@Data
public class DictTypeVO implements Serializable {
    private Long id;
    private String dictName;
    private String dictType;
    private String status;
}
