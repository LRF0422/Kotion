package com.knowledge.system.domain.dto;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Data;

import java.io.Serializable;
import java.util.Map;

/**
 * 落地页订阅
 */
@Data
@ApiModel(value = "LandingSubscribeDTO对象", description = "落地页订阅")
public class LandingSubscribeDTO implements Serializable {

	private static final long serialVersionUID = 1L;

	@ApiModelProperty(value = "邮箱")
	private String email;

	@ApiModelProperty(value = "来源页面")
	private String sourcePath;

	@ApiModelProperty(value = "来源")
	private String referrer;

	@ApiModelProperty(value = "UTM 参数")
	private Map<String, String> utm;
}
