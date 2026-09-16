package com.knowledge.system.domain.dto;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Data;

import java.io.Serializable;
import java.util.Map;

/**
 * 落地页渠道短链入参
 */
@Data
@ApiModel(value = "LandingLinkDTO对象", description = "落地页渠道短链")
public class LandingLinkDTO implements Serializable {

	private static final long serialVersionUID = 1L;

	@ApiModelProperty(value = "短链标识，留空则按名称生成")
	private String slug;

	@ApiModelProperty(value = "目标地址")
	private String target;

	@ApiModelProperty(value = "名称")
	private String label;

	@ApiModelProperty(value = "渠道")
	private String channel;

	@ApiModelProperty(value = "是否启用")
	private Boolean enabled;

	@ApiModelProperty(value = "UTM 参数")
	private Map<String, String> utm;
}
