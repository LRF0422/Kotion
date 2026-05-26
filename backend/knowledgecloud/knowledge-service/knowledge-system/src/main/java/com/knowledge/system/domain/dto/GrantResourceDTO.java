package com.knowledge.system.domain.dto;

import java.io.Serializable;

import com.knowledge.system.domain.enums.AccessType;
import com.knowledge.system.domain.permission.ResourceCategory;

import lombok.Data;

@Data
public class GrantResourceDTO implements Serializable {
    
    private Long roleId;
    private Long resourceId;
    private String resourceName;
    private ResourceCategory resourceCategory;
    private AccessType accessType;
    
}
