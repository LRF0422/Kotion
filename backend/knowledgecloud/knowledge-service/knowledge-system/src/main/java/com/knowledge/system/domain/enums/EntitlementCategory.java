package com.knowledge.system.domain.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 权益分类：能力开关 / 数值配额。
 *
 * @author Kotion
 */
@Getter
@AllArgsConstructor
public enum EntitlementCategory {

	FEATURE("FEATURE", "能力开关"),

	QUOTA("QUOTA", "数值配额");

	private final String code;
	private final String label;
}
