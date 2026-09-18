package com.knowledge.system.domain.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 订阅状态。
 *
 * @author Kotion
 */
@Getter
@AllArgsConstructor
public enum SubscriptionStatus {

	ACTIVE("ACTIVE", "生效中"),

	EXPIRED("EXPIRED", "已过期");

	private final String code;
	private final String label;
}
