package com.knowledge.system.domain.vo;

import lombok.Data;

import java.io.Serializable;

@Data
public class GroupMemberVO implements Serializable {

	private String account;
	private String nickName;
	private Long userId;
	private String email;
}
