package com.knowledge.core.log.model;

import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 登录日志模型
 *
 * @author jiang
 */
@Data
public class LogLogin implements Serializable {

	private static final long serialVersionUID = 1L;

	/**
	 * 主键id
	 */
	private Long id;

	/**
	 * 租户ID
	 */
	private String tenantId;

	/**
	 * 登录账号
	 */
	private String account;

	/**
	 * 用户ID（登录成功时）
	 */
	private Long userId;

	/**
	 * 是否成功：1-成功 0-失败
	 */
	private Integer success;

	/**
	 * 失败原因：BAD_CREDENTIALS/USER_DISABLED/...
	 */
	private String failReason;

	/**
	 * 操作IP地址
	 */
	private String remoteIp;

	/**
	 * 用户代理
	 */
	private String userAgent;

	/**
	 * 创建时间
	 */
	private LocalDateTime createTime;

}
