package com.knowledge.system.domain.vo;

import java.io.Serializable;

import lombok.Data;

@Data
public class UserGroupVO implements Serializable {

	private Long id;
	private String name;
	private String description;
	private Long objectId;
	private Boolean isDefault;
	private Boolean isAdmin;

}
