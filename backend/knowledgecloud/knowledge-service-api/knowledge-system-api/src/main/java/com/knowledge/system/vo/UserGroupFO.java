package com.knowledge.system.vo;

import java.io.Serializable;

import lombok.Data;

@Data
public class UserGroupFO implements Serializable {
    private Long id;
    private String name;
    private String description;
    private Long objectId;
    private Boolean isDefault;
    private Boolean isAdmin;
}
