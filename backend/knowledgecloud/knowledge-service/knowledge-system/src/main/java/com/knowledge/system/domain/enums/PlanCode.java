package com.knowledge.system.domain.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 订阅方案编码。三档：免费版 / 专业版 / 专业增强版。
 *
 * @author Kotion
 */
@Getter
@AllArgsConstructor
public enum PlanCode {

	FREE("FREE", "免费版", 0),

	PRO("PRO", "专业版", 1),

	PRO_PLUS("PRO_PLUS", "专业增强版", 2);

	private final String code;
	private final String label;
	private final int tier;

	/** 未知识别码回退免费版，保证任何脏数据都不会意外放大权益。 */
	public static PlanCode fromCode(String code) {
		if (code != null) {
			for (PlanCode plan : values()) {
				if (plan.code.equalsIgnoreCase(code)) {
					return plan;
				}
			}
		}
		return FREE;
	}
}
