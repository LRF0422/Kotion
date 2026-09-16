package com.knowledge.system.domain.vo;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;

/**
 * 落地页来源
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@ApiModel(value = "LandingReferrerVO对象", description = "落地页来源")
public class LandingReferrerVO implements Serializable {

	private static final long serialVersionUID = 1L;

	@ApiModelProperty(value = "referrer")
	private String referrer;

	@ApiModelProperty(value = "visitors")
	private Long visitors;

	@ApiModelProperty(value = "pageviews")
	private Long pageviews;
}
