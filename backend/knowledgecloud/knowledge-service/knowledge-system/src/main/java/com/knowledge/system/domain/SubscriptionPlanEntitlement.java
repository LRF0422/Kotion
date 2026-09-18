package com.knowledge.system.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;
import com.knowledge.core.common.base.BaseEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * 方案与权益的取值关系。
 *
 * @author Kotion
 */
@Data
@EqualsAndHashCode(callSuper = true)
@TableName("subscription_plan_entitlement")
public class SubscriptionPlanEntitlement extends BaseEntity {

	private static final long serialVersionUID = 1L;

	@TableId(value = "id", type = IdType.ASSIGN_ID)
	@JsonSerialize(using = ToStringSerializer.class)
	private Long id;

	private String planCode;

	private String entCode;

	private Boolean boolValue;

	/** -1 表示不限。 */
	private Long numValue;
}
