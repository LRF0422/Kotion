package com.knowledge.system.vo;

import java.io.Serializable;

import lombok.Data;

@Data
public class RoleFO implements Serializable {

    private Long id;

    private Long parentId;

    private String roleName;

    private Integer sort;

    private String roleAlias;

    private Boolean admin;

    private String clientId;

    private Boolean isGlobal;

    private String ancestors; // 祖先

    private Boolean isDefault;
}
