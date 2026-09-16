package com.knowledge.system.domain.vo;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;

/**
 * 落地页按天趋势
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@ApiModel(value = "LandingDailyTrendVO对象", description = "落地页按天趋势")
public class LandingDailyTrendVO implements Serializable {

	private static final long serialVersionUID = 1L;

	@ApiModelProperty(value = "date")
	private String date;

	@ApiModelProperty(value = "pageviews")
	private Long pageviews;

	@ApiModelProperty(value = "events")
	private Long events;

	@ApiModelProperty(value = "visitors")
	private Long visitors;

	@ApiModelProperty(value = "sessions")
	private Long sessions;
}
