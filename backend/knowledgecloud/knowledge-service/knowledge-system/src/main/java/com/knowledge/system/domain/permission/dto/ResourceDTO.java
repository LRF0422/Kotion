package com.knowledge.system.domain.permission.dto;

import lombok.Data;

import java.io.Serializable;
import java.util.List;

@Data
public class ResourceDTO implements Serializable {

	private Long id;
	private String name;
	private String alias;
	private String content;
	private String category;
	private List<String> allowActions;
}
