package com.knowledge.system.domain.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.experimental.SuperBuilder;

import java.io.Serializable;
import java.util.List;

@Data
@SuperBuilder
@AllArgsConstructor
@NoArgsConstructor
public class UserGroupDTO implements Serializable {

	private String name;
	private String description;
	private Long objectId;
	private Boolean isDefault;
	private Boolean isAdmin;
	private String tenantId;
	private List<GroupMemberDTO> members;


	@Data
	@AllArgsConstructor
	@NoArgsConstructor
	@SuperBuilder
	public static class GroupMemberDTO implements Serializable {
		private Long userId;
		private String nickName;
	}
}
