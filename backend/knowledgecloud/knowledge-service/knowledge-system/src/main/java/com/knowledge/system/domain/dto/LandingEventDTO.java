package com.knowledge.system.domain.dto;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Data;

import java.io.Serializable;
import java.util.Map;

/**
 * 落地页单个埋点事件
 */
@Data
@ApiModel(value = "LandingEventDTO对象", description = "落地页埋点事件")
public class LandingEventDTO implements Serializable {

	private static final long serialVersionUID = 1L;

	@ApiModelProperty(value = "事件名，pageview 为页面浏览")
	private String name;

	@ApiModelProperty(value = "页面路径")
	private String path;

	@ApiModelProperty(value = "页面标题")
	private String title;

	@ApiModelProperty(value = "来源")
	private String referrer;

	@ApiModelProperty(value = "客户端时间戳（毫秒）")
	private Long ts;

	@ApiModelProperty(value = "事件属性")
	private Map<String, Object> props;
}
