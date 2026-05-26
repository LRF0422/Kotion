package com.knowledge.core.tool.exception;

public interface BusinessExceptionAssert extends Assert, IExpection {

	@Override
	default BusinessException newException(Object... variables) {
		return new BusinessException(this, variables);
	}

	@Override
	default BusinessException newException(String errorMessage, Object... variables) {
		return new BusinessException(this, errorMessage, null, variables);
	}

	@Override
	default BusinessException newException(Throwable t, Object... variables) {
		return new BusinessException(this, null, t, variables);
	}
}
