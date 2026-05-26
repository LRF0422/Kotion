package com.knowledge.system.dto;

import java.io.Serializable;

import lombok.Data;

@Data
public class DictTypeDTO implements Serializable {

    private Long id;
    private String dictName;
    private String dictType;
    private String status;

}
