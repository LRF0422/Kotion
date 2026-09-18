package com.knowledge.system.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;
import com.knowledge.core.common.base.BaseEntity;
import io.swagger.annotations.ApiModelProperty;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.math.BigDecimal;

/**
 * 订阅方案。
 *
 * @author Kotion
 */
@Data
@EqualsAndHashCode(callSuper = true)
@TableName("subscription_plan")
public class SubscriptionPlan extends BaseEntity {

	private static final long serialVersionUID = 1L;

	@ApiModelProperty(value = "主键")
	@TableId(value = "id", type = IdType.ASSIGN_ID)
	@JsonSerialize(using = ToStringSerializer.class)
	private Long id;

	/** 方案编码，见 {@link com.knowledge.system.domain.enums.PlanCode}。 */
	private String planCode;

	private String planName;

	private String description;

	/** 档位：0 免费 / 1 专业 / 2 专业增强。 */
	private Integer tier;

	private BigDecimal monthlyPrice;

	private BigDecimal yearlyPrice;

	/** 营销卖点，一句话。 */
	private String highlight;

	private Integer sort;

	/** 1 启用 / 0 停用。 */
	private Integer status;
}
