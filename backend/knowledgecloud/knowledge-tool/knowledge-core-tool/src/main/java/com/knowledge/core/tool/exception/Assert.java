package com.knowledge.core.tool.exception;

public interface Assert {

	/**
	 * 创建异常
	 *
	 * @param variables
	 * @return
	 */
	BusinessException newException(Object... variables);

	/**
	 * 创建异常
	 *
	 * @param variables
	 * @return
	 */
	BusinessException newException(String errorMessage, Object... variables);

	/**
	 * 创建异常
	 *
	 * @param t
	 * @param variables
	 * @return
	 */
	BusinessException newException(Throwable t, Object... variables);

	default void assertTrue(boolean flag) {
		if (flag) {
			throw newException();
		}
	}

	default void assertTrue(boolean flag, String message) {
		if (flag) {
			throw newException(message);
		}
	}

}
