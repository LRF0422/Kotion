package com.knowledge.system.domain.vo;

import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 订阅授予日志视图。
 *
 * @author Kotion
 */
@Data
public class SubscriptionGrantVO implements Serializable {

	private static final long serialVersionUID = 1L;

	@JsonSerialize(using = ToStringSerializer.class)
	private Long id;

	@JsonSerialize(using = ToStringSerializer.class)
	private Long userId;

	private String account;

	private String userName;

	private String fromPlan;

	private String toPlan;

	private String source;

	@JsonSerialize(using = ToStringSerializer.class)
	private Long operatorId;

	private LocalDateTime startTime;

	private LocalDateTime endTime;

	private String remark;

	private LocalDateTime createTime;
}
