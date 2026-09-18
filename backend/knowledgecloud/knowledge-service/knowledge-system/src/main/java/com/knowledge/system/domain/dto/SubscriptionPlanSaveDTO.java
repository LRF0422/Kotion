package com.knowledge.system.domain.dto;

import io.swagger.annotations.ApiModelProperty;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;

/**
 * 管理端保存方案信息入参（不含权益，权益单独保存）。
 *
 * @author Kotion
 */
@Data
public class SubscriptionPlanSaveDTO implements Serializable {

	private static final long serialVersionUID = 1L;

	@ApiModelProperty(value = "方案编码", required = true)
	private String planCode;

	@ApiModelProperty("方案名称")
	private String planName;

	@ApiModelProperty("方案描述")
	private String description;

	@ApiModelProperty("展示月付价格")
	private BigDecimal monthlyPrice;

	@ApiModelProperty("展示年付价格")
	private BigDecimal yearlyPrice;

	@ApiModelProperty("营销卖点")
	private String highlight;

	@ApiModelProperty("排序")
	private Integer sort;

	@ApiModelProperty("1启用 0停用")
	private Integer status;
}
