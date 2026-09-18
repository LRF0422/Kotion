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
 * 订阅兑换码。
 *
 * @author Kotion
 */
@Data
@EqualsAndHashCode(callSuper = true)
@TableName("subscription_redeem_code")
public class SubscriptionRedeemCode extends BaseEntity {

	private static final long serialVersionUID = 1L;

	@TableId(value = "id", type = IdType.ASSIGN_ID)
	@JsonSerialize(using = ToStringSerializer.class)
	private Long id;

	private String code;

	private String planCode;

	/** 时长（天），空/<=0 表示永久。 */
	private Integer days;

	private Integer maxUses;

	private Integer usedCount;

	private LocalDateTime expiresAt;

	/** 1 启用 / 0 停用。 */
	private Integer status;

	private String remark;
}
