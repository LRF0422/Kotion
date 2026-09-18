package com.knowledge.system.domain.dto;

import io.swagger.annotations.ApiModelProperty;
import lombok.Data;

import java.io.Serializable;

/**
 * 兑换码使用入参。
 *
 * @author Kotion
 */
@Data
public class SubscriptionRedeemDTO implements Serializable {

	private static final long serialVersionUID = 1L;

	@ApiModelProperty(value = "兑换码", required = true)
	private String code;
}
