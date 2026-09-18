package com.knowledge.core.entitlement.error;

/**
 * 权益类错误的统一业务码，前端据此弹出升级引导。
 *
 * @author Kotion
 */
public final class EntitlementErrorCodes {

	private EntitlementErrorCodes() {
	}

	/** 当前套餐不具备该能力。 */
	public static final int ENTITLEMENT_REQUIRED = 40301;

	/** 已超出该权益的数值额度。 */
	public static final int QUOTA_EXCEEDED = 40302;
}
