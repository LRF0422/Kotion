package com.knowledge.system.domain.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 订阅来源。本期不做支付，来源以管理和运营手段为主。
 *
 * @author Kotion
 */
@Getter
@AllArgsConstructor
public enum SubscriptionSource {

	ADMIN("ADMIN", "管理员授予"),

	TRIAL("TRIAL", "试用"),

	REDEEM("REDEEM", "兑换码"),

	MIGRATION("MIGRATION", "数据迁移"),

	SYSTEM("SYSTEM", "系统默认");

	private final String code;
	private final String label;

	public static SubscriptionSource fromCode(String code) {
		if (code != null) {
			for (SubscriptionSource source : values()) {
				if (source.code.equalsIgnoreCase(code)) {
					return source;
				}
			}
		}
		return ADMIN;
	}
}
