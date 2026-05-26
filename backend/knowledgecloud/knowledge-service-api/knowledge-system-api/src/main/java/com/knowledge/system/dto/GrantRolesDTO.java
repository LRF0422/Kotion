package com.knowledge.system.dto;

import lombok.Data;

import java.io.Serializable;
import java.util.List;

@Data
public class GrantRolesDTO implements Serializable {

	private Long userId;
	private List<Long> roleIds;
}
