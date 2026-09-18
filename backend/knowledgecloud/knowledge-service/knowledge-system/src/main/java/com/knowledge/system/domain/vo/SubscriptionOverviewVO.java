package com.knowledge.system.domain.vo;

import io.swagger.annotations.ApiModelProperty;
import lombok.Data;

import java.io.Serializable;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 订阅运营看板概览。
 *
 * @author Kotion
 */
@Data
public class SubscriptionOverviewVO implements Serializable {

	private static final long serialVersionUID = 1L;

	@ApiModelProperty("有订阅记录的用户数（含免费）")
	private long totalSubscriptions;

	@ApiModelProperty("付费（非 FREE）订阅数")
	private long paidSubscriptions;

	@ApiModelProperty("各方案人数")
	private Map<String, Long> planCounts = new LinkedHashMap<>();

	@ApiModelProperty("7 天内到期")
	private long expiring7;

	@ApiModelProperty("30 天内到期")
	private long expiring30;

	@ApiModelProperty("已过期")
	private long expired;

	@ApiModelProperty("兑换码总数")
	private long redeemCodes;

	@ApiModelProperty("兑换码累计核销次数")
	private long redeemUsed;
}
