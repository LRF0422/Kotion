package com.knowledge.system.domain.vo;

import io.swagger.annotations.ApiModelProperty;
import lombok.Data;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

/**
 * 订阅目录：权益定义 + 三档方案。前端据此渲染对比表，不硬编码。
 *
 * @author Kotion
 */
@Data
public class SubscriptionCatalogVO implements Serializable {

	private static final long serialVersionUID = 1L;

	@ApiModelProperty(value = "权益定义")
	private List<EntitlementDefinitionVO> entitlements = new ArrayList<>();

	@ApiModelProperty(value = "启用中的方案")
	private List<SubscriptionPlanVO> plans = new ArrayList<>();
}
