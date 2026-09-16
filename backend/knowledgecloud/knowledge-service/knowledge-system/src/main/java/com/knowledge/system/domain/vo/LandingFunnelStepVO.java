package com.knowledge.system.domain.vo;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;

/**
 * 落地页漏斗步骤
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@ApiModel(value = "LandingFunnelStepVO对象", description = "落地页漏斗步骤")
public class LandingFunnelStepVO implements Serializable {

	private static final long serialVersionUID = 1L;

	@ApiModelProperty(value = "index")
	private Integer index;

	@ApiModelProperty(value = "label")
	private String label;

	@ApiModelProperty(value = "type")
	private String type;

	@ApiModelProperty(value = "sessions")
	private Long sessions;

	@ApiModelProperty(value = "visitors")
	private Long visitors;

	@ApiModelProperty(value = "rateFromFirst")
	private Double rateFromFirst;

	@ApiModelProperty(value = "rateFromPrevious")
	private Double rateFromPrevious;
}
