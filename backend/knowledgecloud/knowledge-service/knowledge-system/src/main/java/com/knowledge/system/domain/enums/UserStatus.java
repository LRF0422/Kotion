package com.knowledge.system.domain.enums;

import com.knowledge.core.common.base.BaseEnum;
import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public enum UserStatus implements BaseEnum<String> {
	ACTIVE("ACTIVE", "启用");

	private final String value;
	private final String desc;
}
