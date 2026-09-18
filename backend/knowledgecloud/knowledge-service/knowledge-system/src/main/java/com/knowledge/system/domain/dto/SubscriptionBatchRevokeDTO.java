package com.knowledge.system.domain.dto;

import io.swagger.annotations.ApiModelProperty;
import lombok.Data;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

/**
 * 批量撤销入参。
 *
 * @author Kotion
 */
@Data
public class SubscriptionBatchRevokeDTO implements Serializable {

	private static final long serialVersionUID = 1L;

	@ApiModelProperty(value = "用户ID列表", required = true)
	private List<Long> userIds = new ArrayList<>();

	@ApiModelProperty("备注")
	private String remark;
}
