package com.knowledge.system.domain.dto;

import io.swagger.annotations.ApiModelProperty;
import lombok.Data;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

/**
 * 批量授予入参。
 *
 * @author Kotion
 */
@Data
public class SubscriptionBatchGrantDTO implements Serializable {

	private static final long serialVersionUID = 1L;

	@ApiModelProperty(value = "用户ID列表", required = true)
	private List<Long> userIds = new ArrayList<>();

	@ApiModelProperty(value = "方案编码", required = true)
	private String planCode;

	@ApiModelProperty("有效天数，空/<=0 永久")
	private Integer days;

	@ApiModelProperty("备注")
	private String remark;
}
