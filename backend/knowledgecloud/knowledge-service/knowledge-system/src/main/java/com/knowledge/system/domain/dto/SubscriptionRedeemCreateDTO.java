package com.knowledge.system.domain.dto;

import io.swagger.annotations.ApiModelProperty;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 管理端创建兑换码入参。
 *
 * @author Kotion
 */
@Data
public class SubscriptionRedeemCreateDTO implements Serializable {

	private static final long serialVersionUID = 1L;

	@ApiModelProperty(value = "兑换码", required = true)
	private String code;

	@ApiModelProperty(value = "方案编码", required = true)
	private String planCode;

	@ApiModelProperty("时长（天），空/<=0 永久")
	private Integer days;

	@ApiModelProperty("最大使用次数")
	private Integer maxUses;

	@ApiModelProperty("兑换码过期时间")
	private LocalDateTime expiresAt;

	@ApiModelProperty("1启用 0停用")
	private Integer status;

	@ApiModelProperty("备注")
	private String remark;
}
