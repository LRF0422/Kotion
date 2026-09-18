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
 * 权益定义（字典表）。编码见 {@link EntitlementCodes}。
 *
 * @author Kotion
 */
@Data
@EqualsAndHashCode(callSuper = true)
@TableName("subscription_entitlement")
public class SubscriptionEntitlement extends BaseEntity {

	private static final long serialVersionUID = 1L;

	@TableId(value = "id", type = IdType.ASSIGN_ID)
	@JsonSerialize(using = ToStringSerializer.class)
	private Long id;

	private String entCode;

	private String entName;

	/** FEATURE / QUOTA。 */
	private String category;

	/** BOOLEAN / NUMBER。 */
	private String valueType;

	/** 数值配额单位，如 个 / 人 / bytes / tokens/天；布尔权益为空。 */
	private String unit;

	private String description;

	private Integer sort;

	private Integer status;
}
