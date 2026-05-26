package com.knowledge.system.domain.vo;

import lombok.Data;

import java.io.Serializable;
import java.util.List;

@Data
public class InvitationVO implements Serializable {

	private String nickName;
	private String email;
	private String redirectUrl;
	private List<AppInvitationVO> appInvitations;



	@Data
	public static class AppInvitationVO implements Serializable {
		private Long id;
		private String name;
		private String icon;
		private String desc;
		private String accessType;
	}
}
