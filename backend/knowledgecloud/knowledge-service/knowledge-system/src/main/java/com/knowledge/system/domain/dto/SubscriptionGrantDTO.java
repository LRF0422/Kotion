package com.knowledge.system.domain.dto;

import io.swagger.annotations.ApiModelProperty;
import lombok.Data;

import java.io.Serializable;

/**
 * 管理端授予订阅入参。
 *
 * @author Kotion
 */
@Data
public class SubscriptionGrantDTO implements Serializable {

	private static final long serialVersionUID = 1L;

	@ApiModelProperty(value = "用户ID", required = true)
	private Long userId;

	@ApiModelProperty(value = "方案编码 FREE / PRO / PRO_PLUS", required = true)
	private String planCode;

	@ApiModelProperty(value = "有效天数；为空表示永久（仅免费版有意义）")
	private Integer days;

	@ApiModelProperty(value = "备注")
	private String remark;
}
