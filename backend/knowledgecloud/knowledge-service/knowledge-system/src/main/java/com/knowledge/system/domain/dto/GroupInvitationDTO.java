package com.knowledge.system.domain.dto;


import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.experimental.SuperBuilder;

import java.io.Serializable;
import java.util.List;

@Data
@AllArgsConstructor
@NoArgsConstructor
@SuperBuilder
public class GroupInvitationDTO implements Serializable {

	private Long groupId;
	private List<MemberDetail> members;


	@Data
	@AllArgsConstructor
	@NoArgsConstructor
	@SuperBuilder
	public static class MemberDetail implements Serializable {
		private Long id;
		private Long userId;
		private String nickName;
	}
}
