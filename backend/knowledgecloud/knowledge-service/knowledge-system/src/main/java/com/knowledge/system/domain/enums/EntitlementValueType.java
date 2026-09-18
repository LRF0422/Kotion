package com.knowledge.system.domain.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 权益值类型。
 *
 * @author Kotion
 */
@Getter
@AllArgsConstructor
public enum EntitlementValueType {

	BOOLEAN("BOOLEAN", "布尔"),

	NUMBER("NUMBER", "数值");

	private final String code;
	private final String label;
}
