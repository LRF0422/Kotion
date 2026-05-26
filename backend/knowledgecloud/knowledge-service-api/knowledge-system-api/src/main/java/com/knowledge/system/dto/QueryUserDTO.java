package com.knowledge.system.dto;

import lombok.Data;

import java.io.Serializable;

@Data
public class QueryUserDTO implements Serializable {

	private String name;
	private Integer current;
	private Integer size;

	private String searchValue;
}
