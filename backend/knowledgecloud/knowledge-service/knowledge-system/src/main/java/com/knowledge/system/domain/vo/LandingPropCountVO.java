package com.knowledge.system.domain.vo;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;

/**
 * 落地页事件属性分布
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@ApiModel(value = "LandingPropCountVO对象", description = "落地页事件属性分布")
public class LandingPropCountVO implements Serializable {

	private static final long serialVersionUID = 1L;

	@ApiModelProperty(value = "label")
	private String label;

	@ApiModelProperty(value = "count")
	private Long count;

	@ApiModelProperty(value = "visitors")
	private Long visitors;
}
