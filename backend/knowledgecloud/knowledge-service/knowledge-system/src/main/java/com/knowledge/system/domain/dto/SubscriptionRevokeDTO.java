package com.knowledge.system.domain.dto;

import io.swagger.annotations.ApiModelProperty;
import lombok.Data;

import java.io.Serializable;

/**
 * 管理端撤销订阅入参。
 *
 * @author Kotion
 */
@Data
public class SubscriptionRevokeDTO implements Serializable {

	private static final long serialVersionUID = 1L;

	@ApiModelProperty(value = "用户ID", required = true)
	private Long userId;

	@ApiModelProperty(value = "备注")
	private String remark;
}
