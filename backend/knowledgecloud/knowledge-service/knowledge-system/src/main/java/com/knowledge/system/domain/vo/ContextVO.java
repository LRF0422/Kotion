package com.knowledge.system.domain.vo;

import java.io.Serializable;

import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;

import lombok.Data;

@Data
public class ContextVO implements Serializable {

    private static final long serialVersionUID = 1L;

    private String id;
    private String name;
    private String type;
    private String memberRole;
    private Integer status;

    @JsonSerialize(using = ToStringSerializer.class)
    private Long ownerUserId;
}
