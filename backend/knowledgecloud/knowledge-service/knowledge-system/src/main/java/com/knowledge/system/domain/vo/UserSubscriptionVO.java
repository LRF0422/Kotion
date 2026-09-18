package com.knowledge.system.domain.vo;

import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;
import io.swagger.annotations.ApiModelProperty;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 用户订阅信息视图。
 *
 * @author Kotion
 */
@Data
public class UserSubscriptionVO implements Serializable {

	private static final long serialVersionUID = 1L;

	@JsonSerialize(using = ToStringSerializer.class)
	private Long userId;

	private String planCode;

	private String planName;

	private Integer tier;

	private String status;

	private LocalDateTime startTime;

	/** 为空表示永久有效。 */
	private LocalDateTime endTime;

	@ApiModelProperty(value = "剩余天数；永久有效为 null")
	private Integer remainingDays;

	private Boolean permanent;

	private String source;
}
