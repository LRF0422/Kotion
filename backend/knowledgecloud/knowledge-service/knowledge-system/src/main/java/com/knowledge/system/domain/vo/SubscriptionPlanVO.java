package com.knowledge.system.domain.vo;

import io.swagger.annotations.ApiModelProperty;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 方案详情视图（含机读权益）。
 *
 * @author Kotion
 */
@Data
public class SubscriptionPlanVO implements Serializable {

	private static final long serialVersionUID = 1L;

	@ApiModelProperty(value = "方案编码")
	private String planCode;

	@ApiModelProperty(value = "方案名称")
	private String planName;

	private String description;

	private Integer tier;

	private BigDecimal monthlyPrice;

	private BigDecimal yearlyPrice;

	private String highlight;

	private Integer sort;

	/** 能力开关：code -> 是否可用。 */
	private Map<String, Boolean> features = new LinkedHashMap<>();

	/** 数值配额：code -> 额度（-1 不限）。 */
	private Map<String, Long> quotas = new LinkedHashMap<>();
}
