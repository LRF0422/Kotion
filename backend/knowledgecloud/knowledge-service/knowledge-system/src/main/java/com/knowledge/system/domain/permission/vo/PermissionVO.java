package com.knowledge.system.domain.permission.vo;

import lombok.Data;

import java.io.Serializable;

import com.knowledge.system.domain.permission.ResourceCategory;
import com.knowledge.system.domain.permission.enums.AccessType;

@Data
public class PermissionVO implements Serializable {

	private ResourceCategory category;
	private String name;
	private String alias;
	private Boolean isDefault;
	private String icon;
	private AccessType accessType;	

}
