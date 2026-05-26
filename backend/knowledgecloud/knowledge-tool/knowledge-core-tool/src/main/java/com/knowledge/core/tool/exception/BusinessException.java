package com.knowledge.core.tool.exception;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import com.knowledge.core.tool.utils.StringUtil;

public class BusinessException extends RuntimeException {
	private static final long serialVersionUID = 1L;
	private int code;
	private String msg;
	/**
	 * 错误码对应的参数
	 */
	private Object[] variables;
	/**
	 * 错误消息
	 */
	private String defaultMessage;

	private Throwable cause;

	public BusinessException(IExpection responseEnum, String defaultMessage, Throwable cause, Object... variables) {
		this(responseEnum.getCode(), responseEnum.getMessage(), defaultMessage, cause, variables);
	}

	public BusinessException(Integer code, String msg, String defaultMessage, Throwable cause, Object... variables) {
		super(parseDefaultMsg(msg, defaultMessage, variables));
		this.code = code;
		this.msg = msg;
		this.variables = variables;
		this.defaultMessage = this.getMessage();
		this.cause = cause;
	}

	public BusinessException(IExpection responseEnum, Object... variables) {
		this(responseEnum.getCode(), responseEnum.getMessage(), null, null, variables);
	}

	public BusinessException(Integer code, String msg, Object... variables) {
		this(code, msg, null, null, variables);
	}

	public BusinessException(IExpection responseEnum, Throwable cause, String... variables) {
		this(responseEnum.getCode(), responseEnum.getMessage(), null, cause, variables);
	}

	public BusinessException(String... values) {
	}


	/**
	 * 解析可变消息表达式
	 *
	 * @param msgTemplate
	 * @param values
	 * @return
	 */
	private static String analyticalExpression(String msgTemplate, List<Object> values) {
		Integer i = 0;
		while (i < values.size()) {
			msgTemplate = StringUtil.replace(msgTemplate, "{}", values.size() > i && values.get(i) != null ? values.get(i).toString() : "");
			i++;
		}
		return msgTemplate;
	}

	/**
	 * 解析默认消息
	 *
	 * @param msgTemplate    定义的异常消息(模板)
	 * @param defaultMessage runtime错误消息信息
	 * @param variables      模板中的 可变参数
	 * @return
	 */
	private static String parseDefaultMsg(String msgTemplate, String defaultMessage, Object... variables) {
		return StringUtil.hasText(defaultMessage) ? defaultMessage : analyticalExpression(msgTemplate, variables == null ? new ArrayList<>() : Arrays.asList(variables));
	}
}
