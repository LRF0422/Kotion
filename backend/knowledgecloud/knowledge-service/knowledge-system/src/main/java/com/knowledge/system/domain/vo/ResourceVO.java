package com.knowledge.system.domain.vo;

import java.io.Serializable;

import com.knowledge.system.domain.permission.ResourceCategory;
import com.knowledge.system.domain.permission.enums.AccessType;

import lombok.Data;

@Data
public class ResourceVO implements Serializable {
    private Long id;
    private Long resourceId;
    private String name;
    private String alias;
    private String content;
    private ResourceCategory category;
    private AccessType accessType;
}
