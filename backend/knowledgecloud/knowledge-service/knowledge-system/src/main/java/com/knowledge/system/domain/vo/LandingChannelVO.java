package com.knowledge.system.domain.vo;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;

/**
 * 落地页渠道归因
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@ApiModel(value = "LandingChannelVO对象", description = "落地页渠道归因")
public class LandingChannelVO implements Serializable {

	private static final long serialVersionUID = 1L;

	@ApiModelProperty(value = "source")
	private String source;

	@ApiModelProperty(value = "medium")
	private String medium;

	@ApiModelProperty(value = "campaign")
	private String campaign;

	@ApiModelProperty(value = "visitors")
	private Long visitors;

	@ApiModelProperty(value = "sessions")
	private Long sessions;

	@ApiModelProperty(value = "pageviews")
	private Long pageviews;
}
