package com.knowledge.system.domain.enums;

import com.knowledge.core.common.base.BaseEnum;
import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public enum AccessType implements BaseEnum<String> {

	USER("USER", "USER"),
	ADMIN("ADMIN", "ADMIN");

	private final String value;
	private final String desc;
}
