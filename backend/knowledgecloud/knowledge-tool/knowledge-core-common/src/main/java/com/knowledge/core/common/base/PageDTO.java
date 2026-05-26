package com.knowledge.core.common.base;

import lombok.Data;

import java.io.Serializable;

@Data
public abstract class PageDTO implements Pageable, Serializable {

	private Integer current = 1;
	private Integer pageSize = 10;
	private String searchValue;
}
