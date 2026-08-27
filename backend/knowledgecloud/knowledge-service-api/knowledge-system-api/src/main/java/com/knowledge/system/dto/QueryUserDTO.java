package com.knowledge.system.dto;

import lombok.Data;

import java.io.Serializable;

@Data
public class QueryUserDTO implements Serializable {

	private String name;
	private Integer current = 1;
	private Integer size = 10;

	private String searchValue;
	private Integer status;
	private String roleId;
}
