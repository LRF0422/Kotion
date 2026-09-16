package com.knowledge.system.domain.vo;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;

/**
 * 落地页事件排行
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@ApiModel(value = "LandingEventRankVO对象", description = "落地页事件排行")
public class LandingEventRankVO implements Serializable {

	private static final long serialVersionUID = 1L;

	@ApiModelProperty(value = "name")
	private String name;

	@ApiModelProperty(value = "count")
	private Long count;

	@ApiModelProperty(value = "visitors")
	private Long visitors;
}
