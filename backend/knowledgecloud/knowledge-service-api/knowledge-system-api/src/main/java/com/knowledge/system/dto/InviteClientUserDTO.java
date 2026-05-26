package com.knowledge.system.dto;

import lombok.Data;

import javax.validation.constraints.NotNull;
import java.io.Serializable;
import java.util.List;

@Data
public class InviteClientUserDTO implements Serializable {

	@NotNull(message = "应用id不能为空")
	private String clientId;
	@NotNull(message = "用户列表不能为空")
	private List<InviteClientUserDetail> details;

	@Data
	public static class InviteClientUserDetail implements Serializable {

		private Long id;
		private String name;
		private String realName;
		private String email;
		private String account;
		private String clientPermission;

	}
}
