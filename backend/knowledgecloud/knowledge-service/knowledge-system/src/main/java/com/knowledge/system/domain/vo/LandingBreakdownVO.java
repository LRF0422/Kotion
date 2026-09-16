package com.knowledge.system.domain.vo;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;

/**
 * 落地页维度分布
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@ApiModel(value = "LandingBreakdownVO对象", description = "落地页维度分布")
public class LandingBreakdownVO implements Serializable {

	private static final long serialVersionUID = 1L;

	@ApiModelProperty(value = "label")
	private String label;

	@ApiModelProperty(value = "visitors")
	private Long visitors;
}
