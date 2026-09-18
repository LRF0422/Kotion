package com.knowledge.system.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;
import com.knowledge.core.common.base.BaseEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDateTime;

/**
 * 用户订阅关系（每用户一行，切换方案即更新本行）。
 *
 * @author Kotion
 */
@Data
@EqualsAndHashCode(callSuper = true)
@TableName("user_subscription")
public class UserSubscription extends BaseEntity {

	private static final long serialVersionUID = 1L;

	@TableId(value = "id", type = IdType.ASSIGN_ID)
	@JsonSerialize(using = ToStringSerializer.class)
	private Long id;

	@JsonSerialize(using = ToStringSerializer.class)
	private Long userId;

	private String planCode;

	/** ACTIVE / EXPIRED。 */
	private String status;

	private LocalDateTime startTime;

	/** 为空表示永久有效（免费版）。 */
	private LocalDateTime endTime;

	/** 见 {@link com.knowledge.system.domain.enums.SubscriptionSource}。 */
	private String source;

	@JsonSerialize(using = ToStringSerializer.class)
	private Long operatorId;

	private String remark;
}
