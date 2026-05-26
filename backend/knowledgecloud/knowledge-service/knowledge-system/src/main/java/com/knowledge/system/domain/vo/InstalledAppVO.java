package com.knowledge.system.domain.vo;

import lombok.Data;

import java.io.Serializable;

import com.knowledge.system.domain.permission.enums.AccessType;

@Data
public class InstalledAppVO implements Serializable {

	private Long id;
	private String name;
	private String description;
	private String icon;
	private Boolean isDefault;
	private String domain;

	private AccessType accessType;

	private Integer userCount;
	private Integer onlineCount;
	private String planDesc;

}
