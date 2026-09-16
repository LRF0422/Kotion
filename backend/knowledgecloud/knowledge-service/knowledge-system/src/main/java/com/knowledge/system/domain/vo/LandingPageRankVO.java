package com.knowledge.system.domain.vo;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;

/**
 * 落地页页面排行
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@ApiModel(value = "LandingPageRankVO对象", description = "落地页页面排行")
public class LandingPageRankVO implements Serializable {

	private static final long serialVersionUID = 1L;

	@ApiModelProperty(value = "path")
	private String path;

	@ApiModelProperty(value = "pageviews")
	private Long pageviews;

	@ApiModelProperty(value = "visitors")
	private Long visitors;
}
