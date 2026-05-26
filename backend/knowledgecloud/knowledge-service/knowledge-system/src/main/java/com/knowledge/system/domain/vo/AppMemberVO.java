package com.knowledge.system.domain.vo;

import com.knowledge.system.domain.enums.UserStatus;
import lombok.Data;

import java.io.Serializable;

@Data
public class AppMemberVO implements Serializable {

	private Long userId;
	private String nickName;
	private UserStatus status;
	private Long groupId;
	private String groupName;
}
