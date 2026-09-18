package com.knowledge.core.entitlement.error;

import com.knowledge.core.tool.exception.BusinessException;

/**
 * 权益拒绝异常：带统一业务码 + 触发拒绝的权益编码。
 *
 * @author Kotion
 */
public class EntitlementException extends BusinessException {

	private static final long serialVersionUID = 1L;

	private final String entitlementCode;

	public EntitlementException(int code, String entitlementCode, String message) {
		super(code, message);
		this.entitlementCode = entitlementCode;
	}

	public String getEntitlementCode() {
		return entitlementCode;
	}
}
