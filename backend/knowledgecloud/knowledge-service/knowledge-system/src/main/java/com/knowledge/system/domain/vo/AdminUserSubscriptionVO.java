package com.knowledge.system.domain.vo;

import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 管理端用户订阅列表行。
 *
 * @author Kotion
 */
@Data
public class AdminUserSubscriptionVO implements Serializable {

	private static final long serialVersionUID = 1L;

	@JsonSerialize(using = ToStringSerializer.class)
	private Long userId;

	private String account;

	private String userName;

	private String avatar;

	private String planCode;

	private String planName;

	private Integer tier;

	private String status;

	private LocalDateTime endTime;

	private String source;
}
