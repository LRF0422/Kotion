package com.knowledge.system.domain.permission.dto;

import lombok.Data;

import java.io.Serializable;
import java.util.List;

@Data
public class PermissionDTO implements Serializable {

	private Long id;
	private String action = "*";
	private List<String> actions;
}
