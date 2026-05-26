package com.knowledge.system.domain.enums;

import com.knowledge.core.common.base.BaseEnum;
import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public enum GlobalPermissionItem implements BaseEnum<String> {

	PLATFORM_ADMIN("PLATFORM_ADMIN", "平台管理员"),
	APPLICATION_ADMIN("APPLICATION_ADMIN", "应用管理员"),
	USER("USER", "用户"),
	ANONYMOUS("ANONYMOUS", "匿名用户");

	private final String value;
	private final String desc;
}
