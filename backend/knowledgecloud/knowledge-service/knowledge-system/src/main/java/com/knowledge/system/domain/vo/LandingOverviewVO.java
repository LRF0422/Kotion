package com.knowledge.system.domain.vo;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;

/**
 * 落地页总览
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@ApiModel(value = "LandingOverviewVO对象", description = "落地页总览")
public class LandingOverviewVO implements Serializable {

	private static final long serialVersionUID = 1L;

	@ApiModelProperty(value = "pageviews")
	private Long pageviews;

	@ApiModelProperty(value = "events")
	private Long events;

	@ApiModelProperty(value = "visitors")
	private Long visitors;

	@ApiModelProperty(value = "sessions")
	private Long sessions;

	@ApiModelProperty(value = "newVisitors")
	private Long newVisitors;

	@ApiModelProperty(value = "bounces")
	private Long bounces;

	@ApiModelProperty(value = "bounceRate")
	private Double bounceRate;

	@ApiModelProperty(value = "avgDurationMs")
	private Double avgDurationMs;

	@ApiModelProperty(value = "days")
	private Integer days;
}
