package com.knowledge.system.domain.permission.dto;

import lombok.Data;

import java.io.Serializable;
import java.util.List;

@Data
public class CreatePermissionForRoleDTO implements Serializable {

	private Long roleId;
	private List<PermissionDTO> permissions;

}
