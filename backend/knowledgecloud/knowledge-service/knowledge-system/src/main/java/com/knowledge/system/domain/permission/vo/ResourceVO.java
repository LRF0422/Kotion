package com.knowledge.system.domain.permission.vo;

import lombok.Data;

import java.io.Serializable;
import java.util.List;

@Data
public class ResourceVO implements Serializable {
	private Long id;
	private String name;
	private String alias;
	private String content;
	private String category;
	private List<String> allowActions;
}
