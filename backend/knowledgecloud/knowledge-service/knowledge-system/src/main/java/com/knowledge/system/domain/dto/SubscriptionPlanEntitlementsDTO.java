package com.knowledge.system.domain.dto;

import io.swagger.annotations.ApiModelProperty;
import lombok.Data;

import java.io.Serializable;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 管理端保存方案权益入参。
 *
 * @author Kotion
 */
@Data
public class SubscriptionPlanEntitlementsDTO implements Serializable {

	private static final long serialVersionUID = 1L;

	@ApiModelProperty(value = "能力开关：code -> 是否可用")
	private Map<String, Boolean> features = new LinkedHashMap<>();

	@ApiModelProperty(value = "数值配额：code -> 额度（-1 不限）")
	private Map<String, Long> quotas = new LinkedHashMap<>();
}
